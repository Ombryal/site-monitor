async function loadData() {
  const res = await fetch("status.json");
  const data = await res.json();

  const container = document.getElementById("container");
  const updated = document.getElementById("updated");

  updated.innerText = "Last updated: " + data.updatedAt;

  container.innerHTML = "";

  data.results.forEach(site => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <div class="url">${site.url}</div>
      <div class="status ${site.status}">
        ${site.status.toUpperCase()}
      </div>
      <div>${site.latency ?? "—"} ms</div>
    `;

    container.appendChild(div);
  });
}

loadData();
setInterval(loadData, 10000);
