const currentPage = document.body.dataset.page;
document.querySelectorAll("[data-nav]").forEach((link) => {
  if (link.getAttribute("data-nav") === currentPage) {
    link.classList.add("active");
  }
});
