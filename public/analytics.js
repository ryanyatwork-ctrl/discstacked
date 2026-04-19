(function () {
  var productionHosts = {
    "discstacked.app": true,
    "www.discstacked.app": true,
  };

  if (!productionHosts[window.location.hostname]) {
    return;
  }

  var gaId = "G-DPCDHQYYFF";

  window.dataLayer = window.dataLayer || [];
  window.gtag =
    window.gtag ||
    function gtag() {
      window.dataLayer.push(arguments);
    };

  window.gtag("js", new Date());
  window.gtag("config", gaId, { send_page_view: false });

  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(gaId);
  document.head.appendChild(script);
})();
