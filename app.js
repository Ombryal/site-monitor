async function loadStatus() {
  try {
    const res = await fetch("status.json?cache=" + Date.now());
    const data = await res.json();

    document.getElementById("updated").innerText =
      "Last updated: " + data.updatedAt;

    const list = document.getElementById("list");
    list.innerHTML = "";

    data.results.forEach(item => {
      const card = document.createElement("div");
      card.className = "card";

      const statusClass = item.status || "error";

      card.innerHTML = `
        <div class="site">
          <div class="url">${item.url}</div>
          <div class="latency">
            ${item.latency ? item.latency + " ms" : "No response"}
          </div>
        </div>

        <div class="badge ${statusClass}">
          ${statusClass}
        </div>
      `;

      list.appendChild(card);
    });

  } catch (err) {
    document.getElementById("list").innerHTML =
      "<p style='color:red'>Failed to load status.json</p>";
  }
}

loadStatus();
setInterval(loadStatus, 10000);
