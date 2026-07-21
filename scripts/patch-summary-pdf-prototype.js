const fs = require("node:fs");
const path = require("node:path");

const targets = [
  "summary-pdf-comic-prototype.html",
  "summary-pdf-cv-prototype.html",
];

const linkTag = '  <link rel="stylesheet" href="summary-pdf-overrides.css" />';

for (const target of targets) {
  const filePath = path.join(process.cwd(), target);
  if (!fs.existsSync(filePath)) continue;

  let html = fs.readFileSync(filePath, "utf8");
  if (html.includes('href="summary-pdf-overrides.css"')) continue;

  html = html.replace("</head>", `${linkTag}\n</head>`);
  fs.writeFileSync(filePath, html, "utf8");
}
