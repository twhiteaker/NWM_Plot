"use strict";

var currentDatasets = {
   title: "",
   datasetArray: []
};

var currentChart = null;


function showErr(err) {
   spinner = document.getElementById("spinner");
   spinner.style.display = "none";
   alert(err.message);
}


function downloadCSV() {
   if (!currentDatasets["datasetArray"]) {
      alert("No data available");
      return;
   }

   const dsArray = currentDatasets.datasetArray;
   // Build the header
   let csv = "Datetime";
   dsArray.forEach(ds => {
      const colName = (ds.label + "_" + ds.units).replace(/ /g, "_").replace(/-/g, "_").replace(/,/g, "").replace(/\(/g, "").replace(/\)/g, "");
      csv += "," + colName;
   });
   csv += "\n";

   // Get all available dates
   let allDates = [];
   dsArray.forEach(ds => {
      ds.data.forEach(xy => {
         allDates.push(xy.x);
      });
   });
   allDates = allDates.filter((date, i, self) =>
      self.findIndex(d => d.getTime() === date.getTime()) === i
   )

   // Initialize an array for the values
   let arr = Array.from(Array(allDates.length), () => new Array(dsArray.length + 1).fill(""));
   for (let i = 0; i < allDates.length; i++) {
      const dt = allDates[i];
      arr[i][0] = moment(dt).format("YYYY-MM-DDTHH:mmZ");
      // Get the value from each dataset at this datetime, if any
      for (let j = 0; j < dsArray.length; j++) {
         const xy = dsArray[j].data;
         let dateIndex = xy.findIndex(function (item) {
            return item.x.getTime() == dt.getTime();
         });
         if (dateIndex != -1) {
            console.log("found you");
            arr[i][j + 1] = xy[dateIndex].y;
         }
      }
   }

   // Add the values to the CSV
   for (let index = 0; index < allDates.length; index++) {
      csv += arr[index].join() + "\n";
   }

   // Create the file link and initiate download
   const filename = currentDatasets["title"] + ".csv";
   if (navigator.msSaveOrOpenBlob) {
      // for Edge
      let blob = new Blob([csv], {
         type: "text/csv"
      });
      navigator.msSaveOrOpenBlob(blob, filename);
   } else {
      let hiddenElement = document.createElement("a");
      hiddenElement.href = "data:text/csv;charset=utf-8," + encodeURI(csv);
      hiddenElement.target = "_blank";
      hiddenElement.download = filename;
      hiddenElement.dispatchEvent(new MouseEvent(`click`, {
         bubbles: true,
         cancelable: true,
         view: window
      }));
   }
}


function downloadImage() {
   if (currentChart === null) {
      alert("No chart available");
      return;
   }

   let a = document.createElement("a");
   a.href = currentChart.toBase64Image();
   a.download = "chart.png";
   a.click();
}


function plotDatasets(datasets, showTotal) {
   // Append '4d' to the colors (alpha channel), except for the hovered index
   function handleHover(evt, item, legend) {
      for (let index = 0; index < legend.chart.data.datasets.length; index++) {
         let dataset = legend.chart.data.datasets[index];
         let newColor = null;
         if (index != item.datasetIndex) {
            newColor = dataset.backgroundColor.slice(0, 16) + "0.1)";
         } else {
            newColor = dataset.backgroundColor.slice(0, 16) + "0.9)";
         }
         dataset.backgroundColor = newColor;
         dataset.borderColor = newColor;
      }
      legend.chart.update();
   }

   // Removes the alpha channel from background colors
   function handleLeave(evt, item, legend) {
      for (let index = 0; index < legend.chart.data.datasets.length; index++) {
         let dataset = legend.chart.data.datasets[index];
         const newColor = dataset.backgroundColor.slice(0, 16) + "0.5)";
         dataset.backgroundColor = newColor;
         dataset.borderColor = newColor;
      }
      // if (index != item.datasetIndex) {
      //    let dataset = legend.chart.data.datasets[index];
      //    const newColor = dataset.backgroundColor.slice(0, 16) + "0.5)";
      //    dataset.backgroundColor = newColor;
      //    dataset.borderColor = newColor;
      // }
      legend.chart.update();
   }

   spinner = document.getElementById("spinner");
   spinner.style.display = "none";

   const ctx = document.getElementById("chart");
   const timeZone = "(time zone " + Intl.DateTimeFormat().resolvedOptions().timeZone + ")";
   const dateOptions = {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      hour12: true
   };
   // const datetimes = series.dates.map(
   //    datetime => datetime.toLocaleString("en-US", dateOptions)
   // );

   Chart.defaults.font.size = 16;
   // Give charts a white background when saved
   Chart.register({
      id: "white_canvas_background_color",
      afterRender: function (c) {
         const ctx = c.ctx;
         ctx.save();
         // This line is apparently essential to getting the
         // fill to go behind the drawn graph, not on top of it.
         // Technique is taken from:
         // https://stackoverflow.com/a/50126796/165164
         ctx.globalCompositeOperation = "destination-over";
         ctx.fillStyle = "white";
         ctx.fillRect(0, 0, c.width, c.height);
         ctx.restore();
      }
   });

   let axes = {
      x: {
         title: {
            display: true,
            text: "Datetime " + timeZone
         },
         ticks: {
            callback: function (label, index, labels) {
               return moment(label).format("M/D ha");
            }
         }
      },
      y: {
         beginAtZero: true,
         title: {
            display: true,
            text: "Streamflow (cfs)",
            color: "rgba(0, 0, 125, 1)"
         },
         ticks: {
            color: "rgba(0, 0, 125, 1)"
         }
      }
   }

   if (showTotal) {
      axes["y2"] = {
         beginAtZero: true,
         title: {
            display: true,
            text: "Volume (acre-ft)",
            color: "rgba(0, 200, 0, 1)"
         },
         position: "right",
         grid: {
            drawOnChartArea: false, // only want the grid lines for one axis to show up
         },
         ticks: {
            color: "rgba(0, 200, 0, 1)"
         }
      }
   }

   const config = {
      type: "scatter",
      data: {
         datasets: datasets.datasetArray
      },
      options: {
         interaction: {
            mode: "point",
            intersect: true,
         },
         plugins: {
            title: {
               display: true,
               text: datasets.title
            },
            legend: {
               onHover: handleHover,
               onLeave: handleLeave
            },
            tooltip: {
               callbacks: {
                  label: function (context) {
                     const dt = moment(context.raw.x).format("M/D ha");
                     let val = " " + currentDatasets.datasetArray[context.datasetIndex].units;
                     let y = context.raw.y;
                     if (y >= 10) {
                        val = Math.round(y) + val;
                     } else {
                        val = (Math.round(y * 100) / 100) + val;
                     }
                     return dt + ", " + val;
                  }
               }
            }
         },
         scales: axes
      }
   };
   currentChart = new Chart(ctx, config);
   currentDatasets = datasets;
}

function calcTotals(name, lineColor, flows, timeStepSeconds, showPoints) {
   const squareFeetToAcres = 0.00002296;
   let xy = [];
   let total = 0.0;
   for (let i = 0; i < flows.length; i++) {
      total += flows[i]["y"] * timeStepSeconds * squareFeetToAcres;
      xy.push({
         x: flows[i]["x"],
         y: total
      })
   }
   let dataset = {
      label: name,
      data: xy,
      borderColor: lineColor,
      backgroundColor: lineColor,
      yAxisID: "y2",
      showLine: true,
      units: "acre-ft"
   };
   if (!showPoints) {
      dataset["pointRadius"] = 0;
   }
   return dataset;
}


function plotEsriMr(featureid, showTotal) {

   function parseEsriMr(json_text) {
      let data = JSON.parse(json_text);
      if (Object.hasOwn(data, "error")) {
         throw new Error(data.error.message);
      }
      if (data["features"].length === 0) {
         throw new Error("No data returned");
      }

      const timeStepSeconds = 10800.0;
      let datasetTitle = "";
      let xy = [];

      for (let i = 0; i < data["features"].length; i++) {
         let f = data["features"][i];
         let q = f["attributes"]["egdb.dbo.medium_term_current.qout"];
         const milliseconds = f["attributes"]["egdb.dbo.medium_term_current.timevalue"];
         xy.push({
            x: new Date(milliseconds),  // client's local time
            y: q
         })
         if (i === 0) {
            datasetTitle = f["attributes"]["egdb.dbo.LargeScale_v2.gnis_name"].trim();
            if (!datasetTitle) {
               datasetTitle = "COMID " + featureid;
            }
         }
      }

      let lineColor = "rgba(0, 0, 125, 0.5)";
      let dataset = {
         label: "Streamflow",
         data: xy,
         borderColor: lineColor,
         backgroundColor: lineColor,
         yAxisID: "y",
         showLine: true,
         units: "cfs"
      };
      let datasetArray = [];
      datasetArray.push(dataset);

      if (showTotal) {
         lineColor = "rgba(0, 200, 0, 0.5)";
         dataset = calcTotals("Cumulative Volume", lineColor, xy, timeStepSeconds, true);
         datasetArray.push(dataset);
      }

      const datasets = {
         title: datasetTitle,
         datasetArray: datasetArray
      };

      return datasets;
   }

   let uri = ("https://livefeeds2.arcgis.com/arcgis/rest/services/NFIE/" +
      "NationalWaterModel_Medium/MapServer/0/query?" +
      "where=egdb.dbo.LargeScale_v2.station_id={featureid}" +
      "&outFields=*&returnGeometry=false" +
      "&orderByFields=egdb.dbo.medium_term_current.timevalue" +
      "&resultRecordCount=80&f=pjson");
   uri = uri.replace("{featureid}", featureid);
   console.log(uri);
   fetch(uri)
      .then(response => response.text())
      .then(json_text => parseEsriMr(json_text))
      .then(datasets => plotDatasets(datasets, showTotal))
      .catch(err => showErr(err));
}


function plotNWPS(featureid, src, showEnsembles, showTotal) {

   function parseSeries(name, lineColor, data, showPoints) {
      let xy = [];
      for (let i = 0; i < data.length; i++) {
         xy.push({
            x: new Date(data[i]["validTime"]),
            y: data[i]["flow"]
         })
      }
      let dataset = {
         label: name,
         data: xy,
         borderColor: lineColor,
         backgroundColor: lineColor,
         yAxisID: "y",
         showLine: true,
         units: "cfs"
      };
      if (!showPoints) {
         dataset["pointRadius"] = 0;
      }
      return dataset;
   }

   function parseNWPS(json_text, src, showEnsembles, showTotal) {
      let data = JSON.parse(json_text);
      if (Object.hasOwn(data, "code")) {
         throw new Error("No data returned.\n" + data["message"]);
      }

      let node = null;
      let subnode = "series";
      let timeStepSeconds = 3600.0;
      let seriesName = "Streamflow";
      let totalSeriesName = "Cumulative Volume";
      if (src === "nwps_aa") {
         node = "analysisAssimilation";
      } else if (src === "nwps_sr") {
         node = "shortRange";
      } else if (src === "nwps_mr") {
         node = "mediumRange";
         subnode = "mean"
         if (showEnsembles) {
            seriesName = "Streamflow (Q), mean";
            totalSeriesName = "Cumulative Volume (V), mean";
         }
      } else {
         node = "longRange";
         subnode = "mean"
         if (showEnsembles) {
            seriesName = "Streamflow (Q), mean";
            totalSeriesName = "Cumulative Volume (V), mean";
         }
         timeStepSeconds = 3600.0 * 6.0;
      }

      let datasetTitle = data["reach"]["name"].trim();
      if (!datasetTitle) {
         datasetTitle = "COMID " + featureid;
      }

      // Parse the main series, which is "series" or the ensemble mean
      let datasetArray = [];
      let values = data[node][subnode]["data"];
      let lineColor = "rgba(0, 0, 125, 0.5)";
      let dataset = parseSeries(seriesName, lineColor, values, true);
      datasetArray.push(dataset);

      // Parse ensemble members
      if (showEnsembles) {
         lineColor = "rgba(0, 0, 255, 0.5)";
         data = data[node];
         for (let index = 0; index < 16; index++) {
            subnode = "member" + (index + 1)
            if (Object.hasOwn(data, subnode)) {
               seriesName = "Q " + subnode;
               values = data[subnode]["data"];
               dataset = parseSeries(seriesName, lineColor, values, false);
               datasetArray.push(dataset);
            }
         }
      }

      // Add cumulative volume
      let volDatasets = [];
      if (showTotal) {
         // Main series
         lineColor = "rgba(0, 200, 0, 0.5)";
         dataset = calcTotals(totalSeriesName, lineColor, datasetArray[0]["data"], timeStepSeconds, true);
         volDatasets.push(dataset);
         lineColor = "rgba(0, 255, 0, 0.5)";

         // Ensembles, if any
         for (let index = 1; index < datasetArray.length; index++) {
            seriesName = "V member" + index;
            dataset = calcTotals(seriesName, lineColor, datasetArray[index]["data"], timeStepSeconds, false);
            volDatasets.push(dataset);
         }

         datasetArray = [...datasetArray, ...volDatasets];
      }

      const datasets = {
         title: datasetTitle,
         datasetArray: datasetArray
      };

      return datasets;
   }

   let uri = ("https://api.water.orionnetworksolutions.com/v1/reaches/" +
      "{featureid}/streamflow?series={product}");
   uri = uri.replace("{featureid}", featureid);
   if (src === "nwps_aa") {
      uri = uri.replace("{product}", "analysis_assimilation");
   } else if (src === "nwps_sr") {
      uri = uri.replace("{product}", "short_range");
   } else if (src === "nwps_mr") {
      uri = uri.replace("{product}", "medium_range");
   } else {
      uri = uri.replace("{product}", "long_range");
   }
   console.log(uri);
   fetch(uri)
      .then(response => response.text())
      .then(json_text => parseNWPS(json_text, src, showEnsembles, showTotal))
      .then(datasets => plotDatasets(datasets, showTotal))
      .catch(err => showErr(err));
}


function fetchAndPlot(featureid, src, showEnsembles, showTotal) {
   spinner = document.getElementById("spinner");
   spinner.style.display = "block";
   if (src === "esri_mr") {
      plotEsriMr(featureid, showTotal);
   } else if (src === "nwps_sr" || src === "nwps_aa" || src === "nwps_mr" || src === "nwps_lr") {
      plotNWPS(featureid, src, showEnsembles, showTotal);
   } else {
      spinner.style.display = "none";
      alert("Unknown data source: " + src);
   }
}


// When the window loads, read query parameters and plot data
window.onload = function () {
   function setOption(selectElement, value) {
      return [...selectElement.options].some((option, index) => {
         if (option.value == value) {
            selectElement.selectedIndex = index;
            return true;
         }
      });
   }

   let params = new URLSearchParams(location.search);
   let featureid = params.get("featureid");
   let src = params.get("src");
   let showEnsembles = params.get("showEnsembles");
   let showTotal = params.get("showTotal");
   let hideForm = params.get("hideForm");

   if (featureid) {
      document.getElementById("featureid").value = featureid;
   } else {
      featureid = document.getElementById("featureid").value;
   }

   if (src) {
      setOption(document.getElementById("src"), src);
   } else {
      src = document.getElementById("src").value;
   }

   if (showEnsembles === "true") {
      showEnsembles = true;
      document.getElementById("showEnsembles").checked = true;
   } else {
      showEnsembles = false;
   }

   if (showTotal === "true") {
      showTotal = true;
      document.getElementById("showTotal").checked = true;
   } else {
      showTotal = false;
   }

   if (hideForm === "true") {
      document.getElementById("inputForm").style.display = "none";
   }

   fetchAndPlot(featureid, src, showEnsembles, showTotal);
};
