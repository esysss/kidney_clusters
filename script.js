const svg = d3.select("#scatterPlot"),
  width = +svg.attr("width"),
  height = +svg.attr("height");

const tooltip = d3.select(".tooltipq");

let data; // Store data globally

d3.json("patient_data.json").then((loadedData) => {
  data = loadedData; // Store globally

  // Compute statistics
  const totalPatients = data.length;
  const clusterCounts = d3.rollup(
    data,
    (v) => v.length,
    (d) => d.Cluster
  );
  const numClusters = clusterCounts.size;
  const avgAge = d3.mean(data, (d) => d.Age).toFixed(2);
  const avgCompScore = d3.mean(data, (d) => d.Compatibility_Score).toFixed(2);

  // Select the range slider and update neighborCount dynamically
  const neighborSlider = document.getElementById("neighborSlider");
  const neighborCountValue = document.getElementById("neighborCountValue");

  neighborSlider.addEventListener("input", function () {
    neighborCountValue.textContent = neighborSlider.value;
    highlightNeighbors(selectedPatient); // Recalculate neighbors based on the new slider value
  });

  // Compute Hypertension Percentage
  const hypertensionCount = data.filter((d) => d.Hypertension === 1).length;
  const hypertensionPct = ((hypertensionCount / totalPatients) * 100).toFixed(2);

  // Compute Diabetes Percentage
  const diabetesCount = data.filter((d) => d.Diabetes === 1).length;
  const diabetesPct = ((diabetesCount / totalPatients) * 100).toFixed(2);

  // Update the HTML elements
  document.getElementById("hypertensionPct").textContent = hypertensionPct + "%";
  document.getElementById("diabetesPct").textContent = diabetesPct + "%";

  document.getElementById("totalPatients").textContent = totalPatients;
  document.getElementById("numClusters").textContent = numClusters;
  document.getElementById("avgAge").textContent = avgAge;
  document.getElementById("avgCompScore").textContent = avgCompScore;

  const clusterList = document.getElementById("clusterCounts");
  clusterCounts.forEach((count, cluster) => {
    let li = document.createElement("li");
    li.textContent = `Cluster ${cluster}: ${count} patients`;
    clusterList.appendChild(li);
  });

  const xScale = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.Age))
    .range([50, width - 50]);

  const yScale = d3
    .scaleLinear()
    .domain(d3.extent(data, (d) => d.Kidney_Function_Score))
    .range([height - 50, 50]);

  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);

  // Create zoom behavior
  const zoom = d3
    .zoom()
    .scaleExtent([1, 5])
    .on("zoom", (event) => {
      scatterPlot.attr("transform", event.transform);
    });

  svg.call(zoom);

  // Create scatter plot group
  const scatterPlot = svg.append("g");

  // Draw circles
  const circles = scatterPlot
    .selectAll("circle")
    .data(data)
    .enter()
    .append("circle")
    .attr("cx", (d) => xScale(d.Age))
    .attr("cy", (d) => yScale(d.Kidney_Function_Score))
    .attr("r", 5)
    .attr("fill", (d) => colorScale(d.Cluster))
    .attr("opacity", 0.7)
    .on("mouseover", (event, d) => {
      console.log(event.pageX + 10);
      tooltip
        .style("display", "block")
        .html(`Patient ID: ${d.Patient_ID}<br>Age: ${d.Age}<br>Kidney Score: ${d.Kidney_Function_Score}`)
        .style("left", event.pageX + 10 + "px")
        .style("top", event.pageY - 20 + "px");
    })
    .on("mouseout", () => tooltip.style("display", "none"))

    .on("click", (event, selectedPatient) => {
      highlightNeighbors(selectedPatient);
    });

  const clusterNames = new Map(); // Stores editable cluster names

  const legendContainer = document.getElementById("legend");

  // Create legend items with editable names
  clusterCounts.forEach((_, cluster) => {
    let legendItem = document.createElement("li");

    // Create color box
    let colorBox = document.createElement("span");
    colorBox.className = "legend-color";
    colorBox.style.background = colorScale(cluster);

    // Create editable text input for the cluster name
    let clusterInput = document.createElement("input");
    clusterInput.type = "text";
    clusterInput.value = `Cluster ${cluster}`;
    clusterInput.className = "cluster-name-input";
    clusterInput.dataset.clusterId = cluster; // Store cluster ID

    // Store initial name
    clusterNames.set(cluster, clusterInput.value);

    // Update stored name when the user edits the input
    clusterInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        this.blur(); // Remove focus, triggering the update
      }
    });

    // Append elements to the legend item
    legendItem.appendChild(colorBox);
    legendItem.appendChild(clusterInput);
    legendContainer.appendChild(legendItem);
  });

  function highlightNeighbors(selectedPatient) {
    const neighborCount = parseInt(neighborSlider.value);
    const distanceMetric = "euclidean"; // Default distance metric

    function calculateDistance(a, b) {
      if (distanceMetric === "euclidean") {
        return Math.sqrt(Math.pow(a.Age - b.Age, 2) + Math.pow(a.Kidney_Function_Score - b.Kidney_Function_Score, 2));
      } else if (distanceMetric === "manhattan") {
        return Math.abs(a.Age - b.Age) + Math.abs(a.Kidney_Function_Score - b.Kidney_Function_Score);
      } else {
        return Math.abs(a.Compatibility_Score - b.Compatibility_Score);
      }
    }

    const distances = data.map((patient) => ({
      ...patient,
      distance: calculateDistance(selectedPatient, patient),
    }));

    const neighbors = distances.sort((a, b) => a.distance - b.distance).slice(0, neighborCount + 1);

    // Highlight points in scatter plot
    circles.attr("opacity", 0.3);
    scatterPlot
      .selectAll("circle")
      .filter((d) => neighbors.some((n) => n.Patient_ID === d.Patient_ID))
      .attr("opacity", 1)
      .attr("stroke", (d) => (d.Patient_ID === selectedPatient.Patient_ID ? "red" : "black"))
      .attr("stroke-width", 2);

    // Update table with selected patient and neighbors
    updateNeighborTable(neighbors);
  }

  function updateNeighborTable(neighbors) {
    const tableHeader = document.getElementById("tableHeader");
    const tableBody = document.getElementById("tableBody");

    // Clear previous table content
    tableHeader.innerHTML = "";
    tableBody.innerHTML = "";

    // Get keys (column names) from the first neighbor
    const columns = Object.keys(neighbors[0]);

    // Populate table header
    columns.forEach((col) => {
      let th = document.createElement("th");
      th.textContent = col.replace("_", " "); // Format column names
      tableHeader.appendChild(th);
    });

    // Populate table body
    neighbors.forEach((patient) => {
      let row = document.createElement("tr");
      columns.forEach((col) => {
        let td = document.createElement("td");
        td.textContent = patient[col];
        row.appendChild(td);
      });
      tableBody.appendChild(row);
    });
  }
});
