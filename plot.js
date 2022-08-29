"use strict";

const squareFeetToAcres = 0.00002296;

var currentSeries = {
   name: "",
   vals: [],
   totals: [],
   dates: []
};

var currentChart = null;


function downloadCSV() {
   if (!currentSeries["vals"]) {
      alert("No series available");
      return;
   }

   let csv = "Datetime,Streamflow_cfs";
   const showTotal = document.getElementById("showTotal").checked;
   if (showTotal) {
      csv += ",Cumulative_Volume_acre_ft";
   }
   csv += "\n";
   for (let index = 0; index < currentSeries["vals"].length; index++) {
      csv += moment(currentSeries["dates"][index]).format("YYYY-MM-DDTHH:mmZ") + "," + currentSeries["vals"][index];
      if (showTotal) {
         csv += "," + currentSeries["totals"][index];
      }
      csv += "\n";
   }

   const filename = currentSeries["name"] + ".csv";
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


function plotSeries(series, showTotal) {
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
   const datetimes = series.dates.map(
      datetime => datetime.toLocaleString("en-US", dateOptions)
   );

   Chart.defaults.font.size = 16;
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

   let datasets = [{
      label: "Streamflow",
      backgroundColor: "rgba(0, 0, 155, 0.5)",
      borderColor: "rgba(0, 0, 155, 0.5)",
      data: series.vals,
      yAxisID: "y"
   }];

   let axes = {
      x: {
         title: {
            display: true,
            text: "Datetime " + timeZone
         }
      },
      y: {
         beginAtZero: true,
         title: {
            display: true,
            text: "Streamflow (cfs)"
         }
      }
   }

   if (showTotal) {
      datasets.push({
         label: "Cumulative Volume",
         backgroundColor: "rgba(0, 255, 0, 0.5)",
         borderColor: "rgba(0, 255, 0, 0.5)",
         data: series.totals,
         yAxisID: "y1"
      });
      axes["y1"] = {
         beginAtZero: true,
         title: {
            display: true,
            text: "Volume (acre-ft)"
         },
         position: "right",
         grid: {
            drawOnChartArea: false, // only want the grid lines for one axis to show up
         },
      }
   }

   const config = {
      type: "line",
      data: {
         labels: datetimes,
         datasets: datasets
      },
      options: {
         interaction: {
            mode: "index",
            intersect: true,
         },
         plugins: {
            title: {
               display: true,
               text: "Data for " + series.name
            }
         },
         scales: axes,
      }
   };
   currentChart = new Chart(ctx, config);
   currentSeries = series;
}

function showErr(err) {
   spinner = document.getElementById("spinner");
   spinner.style.display = "none";
   alert(err.message);
}

function plotEsriMr(featureid, showTotal) {

   function parseEsriMr(json_text) {
      let data = JSON.parse(json_text);
      if (data["features"].length === 0) {
         alert("No data returned");
         return;
      }

      let vals = [];
      let totals = [];
      let dates = [];
      let name = "";
      let total = 0.0;
      const timeStepSeconds = 10800.0;
      for (let i = 0; i < data["features"].length; i++) {
         let f = data["features"][i];
         let q = f["attributes"]["egdb.dbo.medium_term_current.qout"];
         vals.push(q);
         total += q * timeStepSeconds * squareFeetToAcres;
         totals.push(total);
         let milliseconds = f["attributes"]["egdb.dbo.medium_term_current.timevalue"];
         dates.push(new Date(milliseconds));  // client's local time
         if (i === 0) {
            name = f["attributes"]["egdb.dbo.LargeScale_v2.gnis_name"];
            let comid = f["attributes"]["egdb.dbo.LargeScale_v2.station_id"];
            if (!name) {
               name = comid;
            }
         }
      }

      const series = {
         name: name,
         vals: vals,
         totals: totals,
         dates: dates
      };

      return series;
   }

   let uri = ("https://livefeeds2.arcgis.com/arcgis/rest/services/NFIE/" +
      "NationalWaterModel_Medium/MapServer/0/query?" +
      "where=egdb.dbo.LargeScale_v2.station_id={featureid}" +
      "&outFields=*&returnGeometry=false" +
      "&orderByFields=egdb.dbo.medium_term_current.timevalue" +
      "&resultRecordCount=80&f=pjson");
   uri = uri.replace("{featureid}", featureid)
   fetch(uri)
      .then(response => response.text())
      .then(json_text => parseEsriMr(json_text))
      .then(series => plotSeries(series, showTotal))
      .catch(err => showErr(err));
}


function plotNWPS(featureid, src, showTotal) {

   function parseNWPS(json_text, src) {
      let data = JSON.parse(json_text);
      if (Object.hasOwn(data, "code")) {
         alert("No data returned.\n" + data["message"]);
         return;
      }

      let node = null;
      let subnode = "series";
      let timeStepSeconds = 3600.0;
      if (src === "nwps_aa") {
         node = "analysisAssimilation";
      } else if (src === "nwps_sr") {
         node = "shortRange";
      } else if (src === "nwps_mr") {
         node = "mediumRange";
         subnode = "mean"
      } else {
         node = "longRange";
         subnode = "mean"
         timeStepSeconds = 3600.0 * 6.0;
      }

      let vals = [];
      let totals = [];
      let dates = [];
      let name = data["reach"]["name"];
      if (!name) {
         name = featureid;
      }
      let total = 0.0;
      data = data[node][subnode]["data"];
      for (let i = 0; i < data.length; i++) {
         let q = data[i]["flow"];
         vals.push(q);
         total += q * timeStepSeconds * squareFeetToAcres;
         totals.push(total);
         let dateString = data[i]["validTime"];
         dates.push(new Date(dateString));  // client's local time
      }

      const series = {
         name: name,
         vals: vals,
         totals: totals,
         dates: dates
      };

      return series;
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
      .then(json_text => parseNWPS(json_text, src))
      .then(series => plotSeries(series, showTotal))
      .catch(err => showErr(err));
}


function fetchAndPlot(featureid, src, showTotal) {
   spinner = document.getElementById("spinner");
   spinner.style.display = "block";
   if (src === "esri_mr") {
      plotEsriMr(featureid, showTotal);
   } else if (src === "nwps_sr" || src === "nwps_aa" || src === "nwps_mr" || src === "nwps_lr") {
      plotNWPS(featureid, src, showTotal);
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

   if (showTotal === "true") {
      showTotal = true;
      document.getElementById("showTotal").checked = true;
   } else {
      showTotal = false;
   }

   if (hideForm === "true") {
      document.getElementById("inputForm").style.display = "none";
   }

   fetchAndPlot(featureid, src, showTotal);
};
