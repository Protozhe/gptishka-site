(function () {
        function printError(kind, message) {
          const pre = document.createElement("pre");
          pre.style.padding = "16px";
          pre.style.margin = "16px";
          pre.style.background = "#fff";
          pre.style.border = "1px solid #fecaca";
          pre.style.borderRadius = "12px";
          pre.style.color = "#991b1b";
          pre.style.whiteSpace = "pre-wrap";
          pre.textContent = "[admin-ui " + kind + "] " + message;
          document.body.appendChild(pre);
        }
        window.addEventListener("error", function (event) {
          printError("error", (event && event.message) || "Unknown error");
        });
        window.addEventListener("unhandledrejection", function (event) {
          var reason = event && event.reason;
          var text = typeof reason === "string" ? reason : (reason && reason.message) || JSON.stringify(reason);
          printError("promise", text || "Unhandled rejection");
        });
      })();
