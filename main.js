console.log("✅ main.js debug2");

const mount = document.getElementById("canvasMount");
if (!mount) {
  console.error("❌ Manca #canvasMount in index.html");
} else {
  // se il container è alto 0, forziamo un'altezza minima
  mount.style.minHeight = "520px";
  mount.style.width = "100%";

  if (typeof window.p5 === "undefined") {
    console.error("❌ p5 non è caricato. Controlla lo script tag p5.min.js in index.html");
  } else {
    new p5((p) => {
      p.setup = () => {
        const c = p.createCanvas(mount.clientWidth, 520);
        c.parent(mount);
      };
      p.draw = () => {
        p.background(10);
        p.noStroke();
        p.fill(0, 200, 160);
        p.ellipse(p.width / 2, p.height / 2, 220, 220);
        p.fill(255);
        p.textSize(14);
        p.textAlign(p.CENTER, p.CENTER);
        p.text("CANVAS OK", p.width / 2, p.height / 2);
      };
    });
  }
}
