(() => {
  const cached = localStorage.getItem("handle-cached");
  const styles = document.getElementById("account-button-ssr-styles");
  if (cached && styles) {
    styles.textContent =
      `.account-button-ssr-logged-out{display:none}.account-button-ssr-handle:before{content:"${cached}"}`;
  }
})();
