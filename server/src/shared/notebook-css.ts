// The handwritten-notebook stylesheet, shared verbatim between the
// Puppeteer PDF renderer (server) and the React notebook viewer (web), so a
// browser preview looks like the PDF it downloads.
//
// Sizes in here are CSS pixels; the PDF renderer prints at A4 with
// 794x1123px logical pages.

export const NOTEBOOK_CSS = `
  :root {
    --paper-bg: #fffdf5;
    --blue-ink: #0b3c85;
    --red-ink: #cc0000;
    --highlight: rgba(255, 235, 59, 0.65);
    --line-color: #d0e1fd;
    --margin-line: #ff9999;
    --sticky-yellow: #fff9c4;
    --sticky-pink: #ffe0b2;
    --sticky-green: #e8f5e9;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* The PDF-handwritten template only styles the inner viewer markup.
     It must NOT touch body or inject an app-level .top-bar: the app shell
     owns those. The light paper page lives in the app (neo-notebook.css). */


  .notebook-page {
    background-color: var(--paper-bg);
    background-image:
      linear-gradient(
        var(--line-color) 1px,
        transparent 1px
      );

    background-size: 100% 32px;

    width: 100%;

    min-height: 1280px;

    padding:
      85px
      50px
      60px
      95px;

    position: relative;

    border-radius: 4px;

    margin-bottom: 40px;

    display: none;

    line-height: 32px;

    font-size: 1.15rem;
  }

  .notebook-page.active-page {
    display: block;
  }

  .notebook-page::before {
    content: "";

    position: absolute;

    top: 0;
    bottom: 0;
    left: 75px;

    width: 2px;

    background-color:
      var(--margin-line);
  }

  .page-header {
    position: absolute;

    top: 20px;
    left: 95px;
    right: 50px;

    display: flex;

    justify-content: space-between;

    border-bottom:
      2px solid var(--red-ink);

    padding-bottom: 5px;

    font-family:
      "Architects Daughter",
      cursive;

    font-weight: bold;

    color: var(--red-ink);

    font-size: 0.95rem;

    gap: 15px;
  }

  .page-header span {
    min-width: 0;
  }

  .spiral-binder {
    position: absolute;

    left: 15px;
    top: 40px;
    bottom: 40px;

    display: flex;

    flex-direction: column;

    justify-content:
      space-between;

    z-index: 10;
  }

  .ring {
    width: 35px;
    height: 12px;

    background:
      linear-gradient(
        180deg,
        #888,
        #ccc,
        #444
      );

    border-radius: 6px;

    margin-bottom: 18px;
  }

  h2.red-title {
    font-family:
      "Permanent Marker",
      cursive;

    color: var(--red-ink);

    font-size: 1.55rem;

    margin:
      15px 0 10px;

    display: inline-block;

    border-bottom:
      3px dashed var(--red-ink);
  }

  h3.section-head {
    font-family:
      "Kalam",
      cursive;

    font-weight: 700;

    color: #990000;

    font-size: 1.3rem;

    margin:
      18px 0 6px;
  }

  p,
  li {
    font-family:
      "Kalam",
      cursive;

    color: var(--blue-ink);

    font-size: 1.12rem;

    margin-bottom: 8px;
  }

  ul,
  ol {
    padding-left: 25px;
    margin-bottom: 15px;
  }

  .highlight {
    background-color:
      var(--highlight);

    padding:
      1px 6px;

    border-radius: 4px;

    font-weight: 700;
  }

  .rough-circle {
    border:
      2px solid var(--red-ink);

    border-radius:
      55% 45% 60% 40% /
      40% 60% 40% 60%;

    padding:
      2px 8px;

    display: inline-block;
  }

  .hand-underline {
    text-decoration:
      underline wavy
      var(--red-ink) 2px;
  }

  .sticky-note {
  break-inside: avoid;
  page-break-inside: avoid;
  
    background-color:
      var(--sticky-yellow);

    padding: 15px;

    margin: 20px 0;

    transform:
      rotate(-0.8deg);

    position: relative;

    border-left:
      5px solid #fbc02d;
  }

  .sticky-note::before {
    content: "📌";

    position: absolute;

    top: -12px;
    right: 15px;
  }

  .sticky-pink {
    background-color:
      var(--sticky-pink);

    border-left-color:
      #f57c00;

    transform:
      rotate(1deg);
  }

  .sticky-green {
    background-color:
      var(--sticky-green);

    border-left-color:
      #388e3c;

    transform:
      rotate(-0.5deg);
  }

  .exam-tip-badge {
    display: inline-block;

    background:
      var(--red-ink);

    color: white;

    font-family:
      "Permanent Marker",
      cursive;

    padding:
      2px 10px;

    font-size: 0.85rem;

    border-radius: 3px;

    margin-right: 8px;
  }

  .code-box {
    break-inside: avoid;
  page-break-inside: avoid;
  background: #f4f4f9;

    border:
      2px dashed #7b1fa2;

    border-radius: 8px;

    padding:
      12px 18px;

    font-family:
      monospace;

    font-size: 0.98rem;

    color: #2e7d32;

    margin: 15px 0;

    white-space: pre-wrap;

    overflow-wrap: anywhere;

    word-break: normal;

    line-height: 1.45;
  }

  .diagram-box {
    break-inside: avoid;
  page-break-inside: avoid;
  background: #fff;

    border:
      2px solid
      var(--blue-ink);

    border-radius: 12px;

    padding: 15px;

    margin: 20px 0;

    text-align: center;

    overflow: hidden;
  }

  .diagram-title {
    font-family:
      "Permanent Marker",
      cursive;

    color: var(--red-ink);

    font-size: 1.05rem;

    margin-bottom: 10px;
  }

  .diagram-box svg {
    display: block;

    max-width: 100%;

    height: auto;

    margin: 0 auto;
  }

  .margin-doodle {
    position: absolute;

    left: 10px;

    font-family:
      "Caveat",
      cursive;

    color: var(--red-ink);

    font-size: 1rem;

    width: 55px;

    text-align: center;

    transform:
      rotate(-5deg);

    font-weight: bold;
  }

  .page-footer {
    position: absolute;

    bottom: 20px;

    left: 95px;
    right: 50px;

    display: flex;

    justify-content:
      space-between;

    border-top:
      1px solid #ccc;

    padding-top: 8px;

    font-family:
      "Architects Daughter",
      cursive;

    font-size: 0.9rem;

    color: #666;
  }

  .notes-table {
    break-inside: avoid;
  page-break-inside: avoid;
  width: 100%;

    border-collapse:
      collapse;

    margin: 15px 0;

    table-layout: fixed;
  }

  .notes-table th,
  .notes-table td {
    border:
      1px solid
      var(--blue-ink);

    padding:
      8px 12px;

    text-align: left;

    overflow-wrap: anywhere;
  }

  .notes-table th {
    background-color:
      rgba(
        255,
        235,
        59,
        0.35
      );

    color: var(--red-ink);

    font-family:
      "Permanent Marker",
      cursive;
  }
`;
