"""Build the brain assets for the BrainLM project page (projects/brainlm/data/).

Usage:  python3 scripts/build_brain_mesh.py projects/brainlm/data [cell_mm]

Reads brain_lh.obj and brain_rh.obj (Brainder pial surfaces) and example_recording.json
from that folder, then writes:
  brain-mesh.bin          both hemispheres, decimated by vertex clustering (default 2.6 mm)
  brain-parcels.json      Schaefer-400 parcel positions aligned to the mesh and snapped to it
  brain-vertex-parcel.bin nearest parcel for every vertex (u16), used to paint the surface
Pure Python, no dependencies.

Binary layout (little-endian):
  0  char[4]  magic 'BRN1'
  4  u32      nVerts
  8  u32      nFaces
  12 f32[3]   quantization origin (min x, y, z)
  24 f32      quantization step (mm per unit)
  28 u32      reserved (0)
  32 u16[nVerts*3]  quantized positions
  .. u16[nFaces*3]  triangle indices
"""
import json
import math
import struct
import sys

DATA = sys.argv[1]
CELL = float(sys.argv[2]) if len(sys.argv) > 2 else 3.0


def read_obj(path):
    verts, faces = [], []
    with open(path) as fh:
        for line in fh:
            if line.startswith('v '):
                verts.append(tuple(map(float, line.split()[1:4])))
            elif line.startswith('f '):
                faces.append(tuple(int(tok.split('/')[0]) - 1 for tok in line.split()[1:4]))
    return verts, faces


def decimate(verts, faces, cell):
    cluster_of = []
    sums = {}
    for (x, y, z) in verts:
        key = (math.floor(x / cell), math.floor(y / cell), math.floor(z / cell))
        cluster_of.append(key)
        s = sums.get(key)
        if s is None:
            sums[key] = [x, y, z, 1]
        else:
            s[0] += x; s[1] += y; s[2] += z; s[3] += 1
    index = {}
    out_verts = []
    for key, (sx, sy, sz, n) in sums.items():
        index[key] = len(out_verts)
        out_verts.append((sx / n, sy / n, sz / n))
    seen = set()
    out_faces = []
    for (a, b, c) in faces:
        ia, ib, ic = index[cluster_of[a]], index[cluster_of[b]], index[cluster_of[c]]
        if ia == ib or ib == ic or ia == ic:
            continue
        k = tuple(sorted((ia, ib, ic)))
        if k in seen:
            continue
        seen.add(k)
        out_faces.append((ia, ib, ic))
    return out_verts, out_faces


def vertex_normals(verts, faces):
    acc = [[0.0, 0.0, 0.0] for _ in verts]
    for (a, b, c) in faces:
        ax, ay, az = verts[a]; bx, by, bz = verts[b]; cx, cy, cz = verts[c]
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx  # area-weighted
        for i in (a, b, c):
            acc[i][0] += nx; acc[i][1] += ny; acc[i][2] += nz
    out = []
    for nx, ny, nz in acc:
        l = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
        out.append((nx / l, ny / l, nz / l))
    return out


lh_v, lh_f = read_obj(f'{DATA}/brain_lh.obj')
rh_v, rh_f = read_obj(f'{DATA}/brain_rh.obj')
print(f'input: lh {len(lh_v)} v / {len(lh_f)} f, rh {len(rh_v)} v / {len(rh_f)} f')

# Decimate each hemisphere separately so clusters never bridge the midline.
lv, lf = decimate(lh_v, lh_f, CELL)
rv, rf = decimate(rh_v, rh_f, CELL)
verts = lv + rv
faces = lf + [(a + len(lv), b + len(lv), c + len(lv)) for (a, b, c) in rf]
print(f'decimated (cell={CELL} mm): {len(verts)} v / {len(faces)} f')
assert len(verts) < 65535, 'too many vertices for u16 indices; increase cell size'

normals = vertex_normals(verts, faces)
# Sanity: at the left-most vertex the outward normal should point to -x.
i_min = min(range(len(lv)), key=lambda i: verts[i][0])
print('normal at left-most vertex (expect x<0):', tuple(round(v, 2) for v in normals[i_min]))
flip = normals[i_min][0] > 0
if flip:
    print('flipping winding/normals')
    faces = [(a, c, b) for (a, b, c) in faces]
    normals = [(-x, -y, -z) for (x, y, z) in normals]

mins = [min(v[i] for v in verts) for i in range(3)]
maxs = [max(v[i] for v in verts) for i in range(3)]
step = max(maxs[i] - mins[i] for i in range(3)) / 65535.0
buf = bytearray()
buf += b'BRN1'
buf += struct.pack('<II', len(verts), len(faces))
buf += struct.pack('<ffff', mins[0], mins[1], mins[2], step)
buf += struct.pack('<I', 0)
for (x, y, z) in verts:
    buf += struct.pack('<HHH', round((x - mins[0]) / step), round((y - mins[1]) / step), round((z - mins[2]) / step))
for f in faces:
    buf += struct.pack('<HHH', *f)
with open(f'{DATA}/brain-mesh.bin', 'wb') as fh:
    fh.write(buf)
print(f'wrote brain-mesh.bin: {len(buf)/1024:.0f} KB; bbox min {[round(m,1) for m in mins]} max {[round(m,1) for m in maxs]}')

# --- Parcel positions: per-axis map normalized coords (+-60) into the mesh bbox, then snap to surface.
coords = json.load(open(f'{DATA}/example_recording.json'))['coords']
cmin = [min(p[i] for p in coords) for i in range(3)]
cmax = [max(p[i] for p in coords) for i in range(3)]
center = [(mins[i] + maxs[i]) / 2 for i in range(3)]
half = [(maxs[i] - mins[i]) / 2 * 0.86 for i in range(3)]
mapped = []
for p in coords:
    q = []
    for i in range(3):
        u = (p[i] - cmin[i]) / (cmax[i] - cmin[i]) * 2 - 1  # [-1, 1]
        q.append(center[i] + u * half[i])
    mapped.append(q)

# Keep each parcel on its own hemisphere: search only that hemisphere's vertices.
left_idx = range(0, len(lv))
right_idx = range(len(lv), len(verts))
snapped = []
for q in mapped:
    pool = left_idx if q[0] < center[0] else right_idx
    best, bd = None, 1e18
    for i in pool:
        v = verts[i]
        d = (v[0] - q[0]) ** 2 + (v[1] - q[1]) ** 2 + (v[2] - q[2]) ** 2
        if d < bd:
            bd, best = d, i
    v, n = verts[best], normals[best]
    lift = 1.2  # mm above the pial surface so points are not z-fighting the mesh
    snapped.append([round(v[k] + n[k] * lift, 1) for k in range(3)])

json.dump({'space': 'mesh', 'note': 'Schaefer-400 parcel positions aligned to brain-mesh.bin and snapped to the pial surface (for visualization).',
           'positions': snapped}, open(f'{DATA}/brain-parcels.json', 'w'), separators=(',', ':'))
print('wrote brain-parcels.json with', len(snapped), 'positions')

# --- Vertex -> parcel lookup (nearest parcel on the same hemisphere), for painting the surface.
left_parcels = [i for i, q in enumerate(mapped) if q[0] < center[0]]
right_parcels = [i for i, q in enumerate(mapped) if q[0] >= center[0]]
lookup = []
for vi, v in enumerate(verts):
    pool = left_parcels if vi < len(lv) else right_parcels
    best, bd = 0, 1e18
    for pi in pool:
        p = snapped[pi]
        d = (v[0] - p[0]) ** 2 + (v[1] - p[1]) ** 2 + (v[2] - p[2]) ** 2
        if d < bd:
            bd, best = d, pi
    lookup.append(best)
with open(f'{DATA}/brain-vertex-parcel.bin', 'wb') as fh:
    fh.write(struct.pack('<%dH' % len(lookup), *lookup))
print('wrote brain-vertex-parcel.bin:', len(lookup), 'vertices;', len(set(lookup)), 'parcels used')
