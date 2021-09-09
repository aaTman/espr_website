function openNav() {
    document.getElementById("mobilenav").style.width = "100%";
    var x = document.getElementById("icon");
    if (x.className === "icon") {
        x.className += " responsive";
      } else {
        x.className = "icon";
      }
    var y = document.getElementById("header-container");
    if (y.className === "header-container") {
        y.className += " responsive";
      } else {
        y.className = "header-container";
      }
}

function closeNav() {
    document.getElementById("mobilenav").style.width = "0%";
    var x = document.getElementById("icon");
    if (x.className === "icon") {
        x.className -= " responsive";
      } else {
        x.className = "icon";
      }
    var y = document.getElementById("header-container");
    if (y.className === "header-container") {
          y.className -= " responsive";
        } else {
          y.className = "header-container";
        }
}

