// Requires cors.js to be loaded first

"use strict";


// Get URL arguments
function getParameterByName(name, url) {
   if (!url) url = window.location.href;
   name = name.replace(/[\[\]]/g, "\\$&");
   var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
      results = regex.exec(url);
   if (!results) return null;
   if (!results[2]) return "";
   return decodeURIComponent(results[2].replace(/\+/g, " ")).trim();
}


function plotSeries(vals, dates, name) {
   var ctx = document.getElementById("chart");
   var config = {
      type: 'line',
      data: {
         labels: dates,
         datasets: [{
            label: name,
            backgroundColor: "rgba(0, 0, 255, 0.5)",
            borderColor: "rgba(0, 0, 255, 0.5)",
            fill: false,
            data: vals,
         }]
      },
      options: {
         title: {
            text: "Hydrograph for " + name
         },
         scales: {
            xAxes: [{
               type: 'time',
               time: {
                  unit: 'day',
                  unitStepSize: 1,
                  displayFormats: {
                     'day': 'MMM DD'
                  },
                  tooltipFormat: 'll HH:mm'
               },
               scaleLabel: {
                  display: true,
                  labelString: 'Date'
               }
            }],
            yAxes: [{
               scaleLabel: {
                  display: true,
                  labelString: "Streamflow (cfs)"
               },
               ticks: {
                  beginAtZero: true
               }
            }]
         },
      }
   };
   var myChart = new Chart(ctx, config);
}


// Function to call if CORS request is successful
function successCallback(headers, response) {
   var data = JSON.parse(response);
   if (data["features"].length === 0) {
      alert("No data returned");
      return;
   }

   var vals = [];
   var dates = []; // 1566745200000
   var name = "";
   var userTimezoneOffset = new Date().getTimezoneOffset() * 60000;
   for (var i = 0; i < data["features"].length; i++) {
      var f = data["features"][i];
      vals.push(f["attributes"]["egdb.dbo.medium_term_current.qout"]);
      var seconds = f["attributes"]["egdb.dbo.medium_term_current.timevalue"];
      dates.push(moment(seconds - userTimezoneOffset));
      if (i === 0) {
         name = f["attributes"]["egdb.dbo.LargeScale_v2.gnis_name"];
         var comid = f["attributes"]["egdb.dbo.LargeScale_v2.station_id"];
         if (!name)
            name = comid;
      }
   }
   plotSeries(vals, dates, name);
}


// Function to call if CORS request fails
function errorCallback() {
   showLoading(false);
   alert("There was an error making the request.");
}


// Passes search URL and callbacks to CORS function
function downloadForecast(featureid) {
   var uri = ("https://livefeeds2.arcgis.com/arcgis/rest/services/NFIE/" +
      "NationalWaterModel_Medium/MapServer/0/query?" +
      "where=egdb.dbo.LargeScale_v2.station_id={featureid}" +
      "&outFields=*&returnGeometry=false" +
      "&orderByFields=egdb.dbo.medium_term_current.timevalue" +
      "&resultRecordCount=80&f=pjson");
   uri = uri.replace("{featureid}", featureid)
   makeCorsRequest(uri, successCallback, errorCallback);
}


// When the window loads, read query parameters and perform search
window.onload = function () {
   var featureid = getParameterByName("featureid");
   if (featureid)
      document.forms.idForm.featureid.value = featureid;
   else
      featureid = document.forms.idForm.featureid.value;
   downloadForecast(featureid);
};