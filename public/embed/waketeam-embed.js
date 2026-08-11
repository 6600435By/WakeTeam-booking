/**
 * WakeTeam booking embed — замена Rubitime на waketeam.by
 *
 * <div id="waketeam-booking" data-booking-url="https://booking.waketeam.by/book/waketeam"></div>
 * <script src="https://booking.waketeam.by/embed/waketeam-embed.js?v=5" async></script>
 *
 * v5: taller max height so the contacts form fits without inner scrolling
 * (inner scroll + overscroll trapped page scrolling on mobile portrait).
 */
(function () {
  var CONTAINER_ID = "waketeam-booking";
  var DEFAULT_HEIGHT = 720;
  var MIN_HEIGHT = 560;
  var MAX_HEIGHT = 1200;

  function init() {
    var el = document.getElementById(CONTAINER_ID);
    if (!el) return;

    var base =
      el.getAttribute("data-booking-url") ||
      (document.currentScript &&
        document.currentScript.getAttribute("data-booking-url")) ||
      "";

    if (!base) {
      console.error("[waketeam-booking] Укажите data-booking-url");
      return;
    }

    var iframe = document.createElement("iframe");
    iframe.src = base.indexOf("?") >= 0 ? base + "&embed=1" : base + "?embed=1";
    iframe.style.width = "100%";
    iframe.style.height = DEFAULT_HEIGHT + "px";
    iframe.style.border = "0";
    iframe.style.display = "block";
    iframe.style.maxHeight = "none";
    iframe.title = "Онлайн-запись WakeTeam";
    iframe.id = "waketeam-booking-iframe";
    iframe.setAttribute("scrolling", "auto");

    el.innerHTML = "";
    el.appendChild(iframe);

    var lastApplied = DEFAULT_HEIGHT;

    function applyHeight(raw) {
      var next = Math.round(Number(raw));
      if (!isFinite(next) || next <= 0) return;
      next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, next + 24));
      if (Math.abs(next - lastApplied) < 12) return;
      lastApplied = next;
      iframe.style.height = next + "px";
    }

    window.addEventListener("message", function (e) {
      if (!e.data) return;
      var payload = e.data;
      if (typeof payload === "string") {
        if (payload.indexOf("height") === -1) return;
        try {
          payload = JSON.parse(payload);
        } catch (err) {
          return;
        }
      }
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "static" && payload.height) {
        applyHeight(payload.height);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
