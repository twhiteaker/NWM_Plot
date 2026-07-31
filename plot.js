"use strict";



var currentDatasets = {
   datasetArray: [],
   title: ""
};

var currentChart = null;


function showErr(err) {
   let spinner = document.getElementById("spinner");
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
   dsArray.forEach((ds) => {
      const colName = (ds.label + "_" + ds.units).replace(/ /g, "_").replace(/-/g, "_").replace(/,/g, "").replace(/\(/g, "").replace(/\)/g, "");
      csv += "," + colName;
   });
   csv += "\n";

   // Get all available dates
   let allDates = [];
   dsArray.forEach((ds) => {
      ds.data.forEach((xy) => {
         allDates.push(xy.x);
      });
   });
   allDates = allDates.filter((date, i, self) =>
      self.findIndex((d) => d.getTime() === date.getTime()) === i
   );

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
   const filename = currentDatasets["title"] + ".png";

   if (currentChart === null) {
      alert("No chart available");
      return;
   }

   let a = document.createElement("a");
   a.href = currentChart.toBase64Image();
   a.download = filename;
   a.click();
}


function plotDatasets(datasets, showTotal) {
   // Returns the "rgba(r, g, b, " portion of an rgba color string, so a new
   // alpha value can be appended. Works regardless of how many digits r, g,
   // and b have (unlike a fixed-length slice).
   function rgbaPrefix(color) {
      return color.slice(0, color.lastIndexOf(",") + 1) + " ";
   }

   // Append '4d' to the colors (alpha channel), except for the hovered index
   function handleHover(evt, item, legend) {
      for (let index = 0; index < legend.chart.data.datasets.length; index++) {
         let dataset = legend.chart.data.datasets[index];
         let newColor = null;
         if (index != item.datasetIndex) {
            newColor = rgbaPrefix(dataset.backgroundColor) + "0.1)";
         } else {
            newColor = rgbaPrefix(dataset.backgroundColor) + "0.9)";
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
         const newColor = rgbaPrefix(dataset.backgroundColor) + "0.5)";
         dataset.backgroundColor = newColor;
         dataset.borderColor = newColor;
      }
      legend.chart.update();
   }

   let spinner = document.getElementById("spinner");
   spinner.style.display = "none";

   const ctx = document.getElementById("chart");
   const timeZone = "(time zone " + Intl.DateTimeFormat().resolvedOptions().timeZone + ")";

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

   // Draws a text label directly on the plot for each static reference line
   // (e.g., Esri high water threshold / flow return periods), near the
   // right edge of the chart, instead of showing them in the legend.
   Chart.register({
      id: "reference_line_labels",
      afterDatasetsDraw: function (c) {
         const yScale = c.scales.y;
         const chartArea = c.chartArea;
         const ctx = c.ctx;
         c.data.datasets.forEach(function (dataset) {
            if (!dataset.referenceLine) {
               return;
            }
            const value = dataset.data[0].y;
            if (value > yScale.max) {
               return; // capped off the top of the chart; nothing to label
            }
            const yPixel = yScale.getPixelForValue(value);
            if (yPixel < chartArea.top || yPixel > chartArea.bottom) {
               return;
            }
            ctx.save();
            ctx.font = "12px sans-serif";
            ctx.fillStyle = dataset.borderColor;
            ctx.textAlign = "right";
            ctx.textBaseline = "bottom";
            ctx.fillText(dataset.label, chartArea.right - 4, yPixel - 2);
            ctx.restore();
         });
      }
   });

   let y_axis_title = "Streamflow (cfs)";
   // Use datasets.datasetArray[0].units for units if available
   if (datasets.datasetArray.length > 0) {
      y_axis_title = "Streamflow (" + datasets.datasetArray[0].units + ")";
   }

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
            text: y_axis_title,
            color: "rgba(0, 0, 125, 1)"
         },
         ticks: {
            color: "rgba(0, 0, 125, 1)"
         }
      }
   }

   // Rounds "range" up to a "nice" number (1, 2, 5, or 10 times a power of
   // ten) -- standard graph-axis rounding, per Paul Heckbert's "Nice Numbers
   // for Graph Labels".
   function niceNum(range, round) {
      const exponent = Math.floor(Math.log10(range));
      const fraction = range / Math.pow(10, exponent);
      let niceFraction;
      if (round) {
         if (fraction < 1.5) {
            niceFraction = 1;
         } else if (fraction < 3) {
            niceFraction = 2;
         } else if (fraction < 7) {
            niceFraction = 5;
         } else {
            niceFraction = 10;
         }
      } else if (fraction <= 1) {
         niceFraction = 1;
      } else if (fraction <= 2) {
         niceFraction = 2;
      } else if (fraction <= 5) {
         niceFraction = 5;
      } else {
         niceFraction = 10;
      }
      return niceFraction * Math.pow(10, exponent);
   }

   // If any dataset is a static reference line (e.g., Esri high water
   // threshold / flow return periods), cap the y-axis to the actual
   // streamflow data range so those reference values -- which can be far
   // larger than the current forecasted flow -- don't compress the real
   // data into a sliver at the bottom of the chart. Lines above the cap
   // simply run off the top of the chart instead of expanding the axis.
   // The cap itself is rounded up to a "nice" tick value so the top of the
   // axis reads like a natural continuation of the tick progression instead
   // of an arbitrary number.
   const hasReferenceLines = datasets.datasetArray.some((ds) => ds.referenceLine);
   if (hasReferenceLines) {
      let maxFlow = 0;
      datasets.datasetArray.forEach((ds) => {
         if (ds.referenceLine || ds.yAxisID !== "y") {
            return;
         }
         ds.data.forEach((pt) => {
            if (pt.y > maxFlow) {
               maxFlow = pt.y;
            }
         });
      });
      if (maxFlow > 0) {
         const targetTickCount = 5;
         const paddedMax = maxFlow * 1.15;
         const step = niceNum(paddedMax / (targetTickCount - 1), true);
         axes.y.max = Math.ceil(paddedMax / step) * step;
         axes.y.ticks.stepSize = step;
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
               onLeave: handleLeave,
               labels: {
                  filter: function (legendItem, chartData) {
                     return !chartData.datasets[legendItem.datasetIndex].referenceLine;
                  }
               }
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
   let downloadButtons = document.getElementById("downloads");
   downloadButtons.style.display = "inline";

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
         let q = f["attributes"]["qout"];
         const milliseconds = f["attributes"]["timevalue"];
         xy.push({
            x: new Date(milliseconds),  // client's local time
            y: q
         })
         if (i === 0) {
            datasetTitle = f["attributes"]["gnis_name"].trim();
            if (!datasetTitle) {
               datasetTitle = "COMID " + featureid;
            }
         }
      }

      let datasetArray = [];

      // Add high water threshold and flow return period reference lines,
      // pushed onto datasetArray before the streamflow dataset so they draw
      // behind it. These are static per-reach attributes (not a time
      // series), so each is drawn as a flat, dashed line spanning the
      // retrieved forecast period. Esri-only: NWPS and ECMWF don't return
      // these attributes.
      const firstAttrs = data["features"][0]["attributes"];
      const startTime = xy[0]["x"];
      const endTime = xy[xy.length - 1]["x"];

      function addReferenceLine(name, value, lineColor) {
         if (value === null || value === undefined || isNaN(value)) {
            return;
         }
         datasetArray.push({
            label: name,
            data: [
               { x: startTime, y: value },
               { x: endTime, y: value }
            ],
            borderColor: lineColor,
            backgroundColor: lineColor,
            yAxisID: "y",
            showLine: true,
            pointRadius: 0,
            borderWidth: 1.5,
            borderDash: [6, 4],
            units: "cfs",
            referenceLine: true
         });
      }

      addReferenceLine("High Water Threshold", firstAttrs["high_water_threshold"], "rgba(0, 0, 0, 0.5)");
      addReferenceLine("50-Year Flow", firstAttrs["rf_50_0_17c"], "rgba(139, 0, 0, 0.5)");
      addReferenceLine("25-Year Flow", firstAttrs["rf_25_0_17c"], "rgba(180, 20, 20, 0.5)");
      addReferenceLine("10-Year Flow", firstAttrs["rf_10_0_17c"], "rgba(200, 90, 0, 0.5)");
      addReferenceLine("5-Year Flow", firstAttrs["rf_5_0_17c"], "rgba(190, 130, 0, 0.5)");
      addReferenceLine("2-Year Flow", firstAttrs["rf_2_0_17c"], "rgba(160, 140, 0, 0.5)");

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

   // Esri's preferred National Water Model feed
   let uri = ("https://livefeeds3.arcgis.com/arcgis/rest/services/NationalWaterModel/" +
      "Medium_Range/MapServer/0/query?" +
      "where=station_id={featureid}" +
      "&time=0,4102444800000" +
      "&outFields=*&returnGeometry=false&returnTrueCurves=false" +
      "&orderByFields=timevalue" +
      "&returnDistinctValues=false&resultRecordCount=100&f=pjson");
   uri = uri.replace("{featureid}", featureid);
   console.log(uri);
   fetch(uri)
      .then((response) => response.text())
      .then((json_text) => parseEsriMr(json_text))
      .then((datasets) => plotDatasets(datasets, showTotal))
      .catch((err) => showErr(err));
}


function plotEcmwf(featureid, showTotal) {

   function parseEcmwf(json_text) {
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
         let q = f["attributes"]["meanflow"];
         const milliseconds = f["attributes"]["timevalue"];
         xy.push({
            x: new Date(milliseconds),  // client's local time
            y: q
         })
         if (i === 0) {
            datasetTitle = f["attributes"]["comid"];
            if (!datasetTitle) {
               datasetTitle = "";
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
         units: "m^3/s"
      };
      let datasetArray = [];
      datasetArray.push(dataset);

      if (showTotal) {
         lineColor = "rgba(0, 200, 0, 0.5)";
         // Make a copy of the data with m3^s converted to cfs
         let xy_cfs = [];
         for (let i = 0; i < xy.length; i++) {
            xy_cfs.push({
               x: xy[i]["x"],
               y: xy[i]["y"] * 35.3147
            })
         }
         dataset = calcTotals("Cumulative Volume", lineColor, xy_cfs, timeStepSeconds, true);
         datasetArray.push(dataset);
      }

      const datasets = {
         title: datasetTitle,
         datasetArray: datasetArray
      };

      return datasets;
   }

   let uri = ("https://livefeeds3dev.arcgis.com/arcgis/rest/services/GEOGLOWS/" +
      "GlobalWaterModel_Medium/MapServer/0/query?" +
      "where=comid={featureid}" +
      "&time=0%2C11111111111111111111111" +
      "&outFields=*&returnGeometry=false&returnTrueCurves=false" +
      "&orderByFields=timevalue+ASC" +
      "&returnDistinctValues=false&resultRecordCount=100&f=pjson");
   uri = uri.replace("{featureid}", featureid);
   console.log(uri);
   fetch(uri)
      .then((response) => response.text())
      .then((json_text) => parseEcmwf(json_text))
      .then((datasets) => plotDatasets(datasets, showTotal))
      .catch((err) => showErr(err));
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
      let hasData = false;
      let datasetArray = [];
      let values = data[node][subnode]["data"];
      let lineColor = "rgba(0, 0, 125, 0.5)";
      let dataset = parseSeries(seriesName, lineColor, values, true);
      if (values.length > 0) {
         hasData = true;
         datasetArray.push(dataset);
      }

      // Parse ensemble members
      if (showEnsembles) {
         lineColor = "rgba(0, 0, 255, 0.5)";
         data = data[node];
         for (let index = 0; index < 16; index++) {
            subnode = "member" + (index + 1)
            if (Object.hasOwn(data, subnode)) {
               seriesName = "Q " + subnode;
               values = data[subnode]["data"];
               if (values.length > 0) {
                  hasData = true;
                  dataset = parseSeries(seriesName, lineColor, values, false);
                  datasetArray.push(dataset);
               }
            }
         }
      }

      if (!hasData) {
         throw new Error("No data returned");
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

   let uri = ("https://api.water.noaa.gov/nwps/v1/reaches/" +
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
      .then((response) => response.text())
      .then((json_text) => parseNWPS(json_text, src, showEnsembles, showTotal))
      .then((datasets) => plotDatasets(datasets, showTotal))
      .catch((err) => showErr(err));
}


function fetchAndPlot(featureid, src, showEnsembles, showTotal) {
   let spinner = document.getElementById("spinner");
   spinner.style.display = "block";
   if (src === "esri_mr") {
      plotEsriMr(featureid, showTotal);
   } else if (src === "ecmwf") {
      plotEcmwf(featureid, showTotal);
   } else if (src === "nwps_sr" || src === "nwps_aa" || src === "nwps_mr" || src === "nwps_lr") {
      plotNWPS(featureid, src, showEnsembles, showTotal);
   } else {
      spinner.style.display = "none";
      alert("Unknown data source: " + src);
   }
}


// When the window loads, read query parameters and plot data
window.onload = function () {
   // Don't allow scroll wheel to change feature ID
   document.addEventListener("wheel", function (event) {
      if (document.activeElement.type === "number" &&
         document.activeElement.classList.contains("noscroll")) {
         document.activeElement.blur();
      }
   });

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
   const hideAbout = params.get("hideAbout");

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

   if (hideAbout === "true") {
      document.getElementById("about").style.display = "none";
   }

   fetchAndPlot(featureid, src, showEnsembles, showTotal);
};
