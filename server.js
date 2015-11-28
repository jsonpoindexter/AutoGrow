

//SQL
var sqlite3 = require('sqlite3');
TransactionDatabase = require("sqlite3-transactions").TransactionDatabase;
// Setup database connection for logging
var db = new TransactionDatabase(
    new sqlite3.Database("AutoGrow.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
);
//var db = new sqlite3.Database('./AutoGrow.db');
// Use node-static module to server chart for client-side dynamic graph
var nodestatic = require('node-static');

//socketIO
var connect = require('connect')
var dir = __dirname;

var io = require('socket.io').listen(connect);

// Setup static server for current directory
var staticServer = new nodestatic.Server(".");

//serial 
var com = require("serialport");
var serialPort = new com.SerialPort("/dev/ttyACM0", {
    baudrate: 9600,
    parser: com.parsers.readline('\r\n')
  });
serialPort.on('open',function() {
  console.log('Port open');
});
serialPort.on('data', function(data) {
    var dataArray = data.split(",");
    var tempC = dataArray[1];
    var tempF = dataArray[2];
    var humidity = dataArray[0];
    var date = Date.now();
    // Add date/time to temperature
    var statement = db.prepare("INSERT INTO TempHumid VALUES (?, ?, ?, ?)");
    // Insert values into prepared statement
    statement.run(tempC, tempF, tempC, date);
});
// Write a single temperature record in JSON format to database table.
function insertTemp(data){
	// data is a javascript object  
	var statement = db.prepare("INSERT INTO TempHumid VALUES (?, ?, ?, ?)");
	// Insert values into prepared statement
	statement.run(data.TempHumid[0].tempC, data.TempHumid[0].tempF, data.TempHumid[0].tempC, data.TempHumid[0].unix_time);
	// Execute the statement
	statement.finalize();
}
// Write a single temperature record in JSON format to database table.
function insertLightCycle(data) {
    // data is a javascript object  
    var statement = db.prepare("INSERT INTO LightCycle VALUES (?, ?, ?)");
    // Insert values into prepared statement
    statement.run(data.TempHumid[0].tempC, data.TempHumid[0].tempF, data.TempHumid[0].tempC, data.TempHumid[0].unix_time);
    // Execute the statement
    statement.finalize();
}
function resetDB(vegDaysCurrent) {
    db.beginTransaction(function (err, tr) {
        tr.run("DELETE FROM LightCycle;");
        date = new Date();
        date = date.setDate(date.getDate() - vegDaysCurrent);
       tr.run("INSERT INTO LightCycle VALUES (30, " + vegDaysCurrent + ", 30, 0," + date + ");")
        tr.commit(function (err) {
            if (err) return console.log("Sad panda :-( commit() failed.", err);
            console.log("Reset LightCycle Table");
        });
    });
}
function insertIntegerTransaction(callback) {
    //console.log('INT ', integer);
    db.beginTransaction(function (err, tr) {
        tr.exec("INSERT INTO data (t) VALUES ('" + (integer++) + "')", function (err) {
            if (err) return console.log(err);
            tr.commit(function (err) {
                //console.log('INT done', integer);
                callback(err);
            });
        });
    });
}
// Get temperature records from database
function selectTemp(num_records, start_date, callback){
    // - Num records is an SQL filter from latest record back trough time series, 
    // - start_date is the first date in the time-series required, 
    // - callback is the output function
    var current_temp = db.all("SELECT * FROM (SELECT * FROM TempHumid WHERE unix_time > (strftime('%s',?)*1000) ORDER BY unix_time DESC LIMIT ?) ORDER BY unix_time;", start_date, num_records,
        function(err, rows){
            if (err){
                response.writeHead(500, { "Content-type": "text/html" });
                response.end(err + "\n");
                console.log('Error serving querying database. ' + err);
                return;
	        }
        data = {temperature_record:[rows]}
        callback(data);
    });
};
function lastTempHumid(callback) { 
    db.each("SELECT * FROM TempHumid ORDER BY unix_time DESC LIMIT 1;", function (err, rows) {
        if (err) {
            response.writeHead(500, { "Content-type": "text/html" });
            response.end(err + "\n");
            console.log('Error serving querying database. ' + err);
            return;
        }
        data = {
            TempHumid: rows
        }
        //console.log(data);
        callback(data);
    }); 
}
function readLightCycle(data, callback) {
    db.each("SELECT * FROM LightCycle;", function (err, rows) {
        if (err) {
            response.writeHead(500, { "Content-type": "text/html" });
            response.end(err + "\n");
            console.log('Error serving querying database. ' + err);
            return;
        }
        data.LightCycle = rows
        var vegDaysMax = data.LightCycle.vegDaysMax;
        var flowerDaysMax = data.LightCycle.flowerDaysMax;
        var startTime = new Date(data.LightCycle.startVeg);
        var totalDays = 60;
        var currentTime = new Date(Date.now());
        var diff = (currentTime.getTime() - startTime.getTime());
        var daysCompleted = Math.round((diff / (1000 * 60 * 60 * 24)));
        var daysLeft = totalDays - daysCompleted;
        if (daysLeft > vegDaysMax) {
            data.LightCycle = {
                vegChartData: [daysCompleted, daysLeft - vegDaysMax],
                flowerChartData: [0, flowerDaysMax]
            }
        } else {
            data.LightCycle = {
                vegChartData: [vegDaysMax, 0],
                flowerChartData: [(daysCompleted - flowerDaysMax), daysLeft]
            }
        }
         callback(data);
    });
}

var fs = require('fs');
var sys = require('sys');
var http = require('http');
var qs = require('querystring');
var streamPort = '8081';

// Setup node http server
var server = http.createServer(
	// Our main server function
	function (request, response) {
	    if (request.method === "GET") {
	        // Grab the URL requested by the client and parse any query options
	        var url = require('url').parse(request.url, true);
	        var pathfile = url.pathname;
	        var query = url.query;

	        // Test to see if it's a database query
	        if (pathfile == '/TempHumid_query.json') {
	            // Test to see if number of observations was specified as url query
	            if (query.num_obs) {
	                var num_obs = parseInt(query.num_obs);
	            }
	            else {
	                // If not specified default to 20. Note use -1 in query string to get all.
	                var num_obs = -1;
	            }
	            if (query.start_date) {
	                var start_date = query.start_date;
	            }
	            else {
	                var start_date = '1970-01-01T00:00';
	            }
	            // Send a message to console log
	            console.log('Database query request from ' + request.connection.remoteAddress + ' for ' + num_obs + ' records from ' + start_date + '.');
	            // call selectTemp function to get data from database
	            selectTemp(num_obs, start_date, function (data) {
	                response.writeHead(200, { "Content-type": "application/json" });
	                response.end(JSON.stringify(data), "ascii");
	            });
	            return;
	        }
	        // Test to see if it's a request for current temperature   
	        if (pathfile == '/temperature_now.json') {
	            lastTempHumid(function (data) {
	                readLightCycle(data, function (data) {
	                    //console.log('test');
	                    response.writeHead(200, { "Content-type": "application/json" });
	                    response.end(JSON.stringify(data), "ascii");
	                });
	            });
	            return;
	        }
	        // Handler for favicon.ico requests
	        if (pathfile == '/favicon.ico') {
	            response.writeHead(200, { 'Content-Type': 'image/x-icon' });
	            response.end();
	            // Optionally log favicon requests.
	            //console.log('favicon requested');
	            return;
	        }
	        else {
	            // Print requested file to terminal
	            console.log('Request from ' + request.connection.remoteAddress + ' for: ' + pathfile);

	            // Serve file using node-static			
	            staticServer.serve(request, response, function (err, result) {
	                if (err) {
	                    // Log the error
	                    sys.error("Error serving " + request.url + " - " + err.message);
	                    // Respond to the client
	                    response.writeHead(err.status, err.headers);
	                    response.end('Error 404 - file not found');
	                    return;
	                }
	                return;
	            })
	        }
	    }
	    else if (request.method === "POST") {
	        if (request.url === "/addEntry") {
	            var requestBody = '';
	            request.on('data', function (data) {
	                requestBody += data;
	                if (requestBody.length > 1e7) {
	                    response.writeHead(413, 'Request Entity Too Large', { 'Content-Type': 'text/html' });
	                    response.end('<!doctype html><html><head><title>413</title></head><body>413: Request Entity Too Large</body></html>');
	                }
	            });
	            request.on('end', function () {
	                var data = qs.parse(requestBody);
	                var vegDaysCurrent = data.vegDaysCurrent;
	                if (data.start) {
	                    console.log(vegDaysCurrent);
	                    resetDB(vegDaysCurrent);
	                }
                    response.writeHead(200, { "Content-type": "application/json" });
                    response.end();
                    
	            }); 
	        } else {
	            response.writeHead(404, 'Resource Not Found', { 'Content-Type': 'text/html' });
	            response.end('<!doctype html><html><head><title>404</title></head><body>404: Resource Not Found</body></html>');
	        }
	    } else {
	        response.writeHead(405, 'Method Not Supported', { 'Content-Type': 'text/html' });
	        return response.end('<!doctype html><html><head><title>405</title></head><body>405: Method Not Supported</body></html>');
	    }
	}
);
// Enable server
server.listen(8080);
// Log message
console.log('Server running at http://localhost:8080');

