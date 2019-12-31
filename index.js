#!/usr/bin/env node

var debug = {
	time: new Date(),
	loadTime: null,
	processingTime: null,
	requests: [],
	stripped: [],
	errors: [],
	cssLength: 0
};

var fs = require("fs");
var process = require("process");
var puppeteer = require("puppeteer");

var args = [].slice.call(process.argv, 2), arg;
var html, url, fakeUrl;
var value;
var width = 1200;
var height = 0;
var matchMQ;
var required;
var prefetch;
var cssOnly = false;
var cssId;
var cssToken;
var exposeStylesheets;
var stripResources;
var localStorage;
var outputDebug;
var outputPath;
var diskCacheDir;
var userAgent;
var scriptPath =  __dirname + "/extractCSS.js";


while (args.length) {
	arg = args.shift();
	switch (arg) {

		case "-f":
		case "--fake-url":
			value = (args.length) ? args.shift() : "";
			if (value) {
				if (!value.match(/(\/|\.[^./]+)$/)) {
					value += "/";
				}
				fakeUrl = value;
			}
			else {
				fail("Expected string for '--fake-url' option");
			}
			break;

		case "-w":
		case "--width":
			value = (args.length) ? args.shift() : "";
			if (value.match(/^\d+$/)) {
				width = value;
			}
			else {
				fail("Expected numeric value for '--width' option");
			}
			break;

		case "-h":
		case "--height":
			value = (args.length) ? args.shift() : "";
			if (value.match(/^\d+$/)) {
				height = value;
			}
			else {
				fail("Expected numeric value for '--height' option");
			}
			break;

		case "-m":
		case "--match-media-queries":
			matchMQ = true;
			break;

		case "-r":
		case "--required-selectors":
			value = (args.length) ? args.shift() : "";
			if (value) {
				value = parseString(value);
				if (typeof value == "string") {
					value = value.split(/\s*,\s*/).map(function (string) {
						return "(?:" + string.replace(/([.*+?=^!:${}()|[\]\/\\])/g, '\\$1') + ")";
					}).join("|");

					value = [value];
				}

				required = value;
			}
			else {
				fail("Expected a string for '--required-selectors' option");
			}
			break;

		case "-e":
		case "--expose-stylesheets":
			value = (args.length) ? args.shift() : "";
			if (value) {
				exposeStylesheets = ((value.indexOf(".") > -1) ? "" : "var ") + value;
			}
			else {
				fail("Expected a string for '--expose-stylesheets' option");
			}
			break;

		case "-p":
		case "--prefetch":
			prefetch = true;
			break;

		case "-t":
		case "--insertion-token":
			value = (args.length) ? args.shift() : "";
			if (value) {
				cssToken = parseString(value);
			}
			else {
				fail("Expected a string for '--insertion-token' option");
			}
			break;

		case "-i":
		case "--css-id":
			value = (args.length) ? args.shift() : "";
			if (value) {
				cssId = value;
			}
			else {
				fail("Expected a string for '--css-id' option");
			}
			break;

		case "-s":
		case "--strip-resources":
			value = (args.length) ? args.shift() : "";
			if (value) {
				value = parseString(value);
				if (typeof value == "string") {
					value = [value];
				}
				value = value.map(function (string) {
					//throw new Error(string);
					return new RegExp(string, "i");
				});
				stripResources = value;
			}
			else {
				fail("Expected a string for '--strip-resources' option");
			}
			break;

		case "-l":
		case "--local-storage":
			value = (args.length) ? args.shift() : "";
			if (value) {
				localStorage = parseString(value);
			}
			else {
				fail("Expected a string for '--local-storage' option");
			}
			break;

		case "-c":
		case "--css-only":
			cssOnly = true;
			break;

		case "-o":
		case "--output":
			value = (args.length) ? args.shift() : "";
			if (value) {
				outputPath = value;
			}
			else {
				fail("Expected a string for '--output' option");
			}
			break;

		case "-d":
		case "--debug":
			outputDebug = true;
			break;

		case "-dcd":
		case "--disk-cache-dir":
			value = (args.length) ? args.shift() : "";
			if (value) {
				diskCacheDir = value;
			}
			else {
				fail("Expected a string for '--disk-cache-dir' option");
			}
			break;

		case "-u":
		case "--user-agent":
			if (value) {
				userAgent = value;
			}
			else {
				fail("Expected a string for '--user-agent' option");
			}
			break;

		default:
			if (!url && !arg.match(/^--?[a-z]/)) {
				url = arg;
			}
			else {
				fail("Unknown option");
			}
			break;
	}

}

(async () => {

	var launchOptions = { args: [] };

	if (diskCacheDir) {
		launchOptions.args.push('--disk-cache-dir=' + diskCacheDir);
	}

	var browser = await puppeteer.launch(launchOptions);

	var page = await browser.newPage();

	if (userAgent) {
		await page.setUserAgent(userAgent);
	}

	await page.setViewport({
		width: width,
		height: height || 800
	});

	if (stripResources) {
		await page.setRequestInterception(true);

		var baseUrl = url || fakeUrl;
	
		page.on('request', request => {
	
			var _url = request.url();
	
			if (_url.indexOf(baseUrl) > -1) {
				_url = _url.slice(baseUrl.length);
			}
	
			if (outputDebug && !_url.match(/^data/) && debug.requests.indexOf(_url) < 0) {
				debug.requests.push(_url);
			}
	
			if (stripResources) {
				var i = 0;
				var l = stripResources.length;
				// /http:\/\/.+?\.(jpg|png|svg|gif)$/gi
				while (i < l) {
					if (stripResources[i++].test(_url)) {
						if (outputDebug) {
							debug.stripped.push(_url);
						}
						request.abort();
						return;
					}
				}
			}
	
			request.continue();
		});	
	}

	async function cssCallback(response) {
		
		if (!response.css) {
			fail('Browser did not return any CSS');
			return;
		}


		await browser.close();

		if ("css" in response) {
			var result;
			if (cssOnly) {
				result = response.css;
			}
			else {
				result = inlineCSS(response.css);
			}
			if (outputDebug) {
				debug.cssLength = response.css.length;
				debug.time = new Date() - debug.time;
				debug.processingTime = debug.time - debug.loadTime;
				result += "\n<!--\n\t" + JSON.stringify(debug) + "\n-->";
			}
			if (outputPath) {
				fs.write(outputPath, result);
			}
			else {
				process.stdout.write(result);
			}
			process.exit();
		}
		else {
			process.stdout.write(response);
			process.exit();
		}
	};
	
	page.on("pageerror", function(err) {  
		outputError("PAGE ERROR", err.toString()); 
	});

	page.on("error", function (err) {  
		outputError("PAGE ERROR", err.toString());
	});
	
	async function pageLoadFinished() {

		if (!html) {
			html = await page.evaluate(function () {
				var xhr = new XMLHttpRequest();
				var html;
				xhr.open("get", window.location.href, false);
				xhr.onload = function () {
					html = xhr.responseText;
				};
				xhr.send();
				return html;
			});
		}

		if(html.indexOf('stylesheet') === -1) {
			process.exit(1);
		}

		debug.loadTime = new Date() - debug.loadTime;
	
		var options = {};
	
		if (matchMQ) {
			options.matchMQ = true;
		}
	
		if (required) {
			options.required = required;
		}
	
		if (localStorage) {
			await page.evaluate(function (data) {
				var storage = window.localStorage;
				if (storage) {
					for (var key in data) {
						storage.setItem(key, data[key]);
					}
				}
			}, localStorage);
		}
	
		if (Object.keys(options).length) {
			await page.evaluate(function (options) {
				window.extractCSSOptions = options;
			}, options);
		}
	
		if (!height) {
			var _height = await page.evaluate(function () {
				return document.body.offsetHeight;
			});
			page.viewportSize = {
				width: width,
				height: _height
			};
		}
	
		await page.on("console", async msg => {

			if (msg.args().length !== 2) {
				return;
			}

			if (await msg.args()[0].jsonValue() !== '_extractedcss') {
				return;
			}

			let response = await msg.args()[1].jsonValue();

			await cssCallback(response);
		});

		if (!fs.lstatSync(scriptPath).isFile()) {
			fail("Unable to locate script at: " + scriptPath);
		}
		await page.addScriptTag({path: scriptPath});
	};

	if (url) {
	
		debug.loadTime = new Date();

		await page.goto(url);
	}
	else {
	
		if (!fakeUrl) {
			fail("Missing \"fake-url\" option");
		}
	
		html = process.stdin.read();
		process.stdin.close();
	
		debug.loadTime = new Date();

		await page.setRequestInterception(true);

		page.once('request', req => {
		  req.respond({
			body: '<html><body><div>Empty dummy page</div></body></html>'
		  });
		});

		await page.goto(fakeUrl);

		if (!stripResources) {
			// disable request interception to allow caching
			await page.setRequestInterception(false);
		}

		if (diskCacheDir) {
			await page.setCacheEnabled(true);
		}

		await page.setContent(html);
	}

	await pageLoadFinished();

})();

function inlineCSS(css) {

	if (!css) {
		return html;
	}

	var tokenAtFirstStylesheet = !cssToken; // auto-insert css if no cssToken has been specified.
	var insertToken = function (m) {
			var string = "";
			if (tokenAtFirstStylesheet) {
				tokenAtFirstStylesheet = false;
				var whitespace = m.match(/^[^<]+/);
				string = ((whitespace) ? whitespace[0] : "") + cssToken;
			}
			return string;
		};
	var links = [];
	var stylesheets = [];

	if (!cssToken) {
		cssToken = "<!-- inline CSS insertion token -->";
	}

	html = html.replace(/[ \t]*<link [^>]*rel=["']?stylesheet["'][^>]*\/>[ \t]*(?:\n|\r\n)?/g, function (m) {
		links.push(m);
		return insertToken(m);
	});

	stylesheets = links.map(function (link) {
		var urlMatch = link.match(/href="([^"]+)"/);
		var mediaMatch = link.match(/media="([^"]+)"/);
		var url = urlMatch && urlMatch[1];
		var media = mediaMatch && mediaMatch[1];

		return { url: url, media: media };
	});

	var index = html.indexOf(cssToken);
	var length = cssToken.length;

	if (index == -1) {
		fail("token not found:\n" + cssToken);
	}

	var replacement = "<style " + ((cssId) ? "id=\"" + cssId + "\" " : "") + "media=\"screen\">\n\t\t\t" + css + "\n\t\t</style>\n";

	if (exposeStylesheets) {
		replacement += "\t\t<script>\n\t\t\t" + exposeStylesheets + " = [" + stylesheets.map(function (link) {
			return "{href:\"" + link.url + "\", media:\"" + link.media + "\"}";
		}).join(",") + "];\n\t\t</script>\n";
	}

	if (prefetch) {
		replacement += stylesheets.map(function (link) {
			return "\t\t<link rel=\"prefetch\" href=\"" + link.url + "\" />\n";
		}).join("");
	}

	return html.slice(0, index) + replacement + html.slice(index + length);

}

function outputError (context, msg, trace) {
	var errMsg = "";
	var errStack = [msg];
	var errInRemoteScript = false;
	if (trace && trace.length) {
		errStack.push("TRACE:");
		trace.forEach(function (t) {
			var source = t.file || t.sourceURL;
			if (!errInRemoteScript && source != scriptPath) {
				errInRemoteScript = true;
			}
			errStack.push(" -> " + source + ": " + t.line + (t.function ? " (in function " + t.function + ")" : ""));
		});
	}
	errMsg = errStack.join("\n");
	if (errInRemoteScript) {
		debug.errors.push(errMsg);
	}
	else {
		fail(context + ": " + errStack.join("\n"));
	}
	
}

function fail(message) {
	process.stderr.write(message + "\n");
	process.exit(1);
}

function parseString(value) {
	if (value.match(/^(["']).*\1$/)) {
		value = JSON.parse(value);
	}
	if (typeof value == "string") {
		if (value.match(/^\{.*\}$/) || value.match(/^\[.*\]$/)) {
			value = JSON.parse(value);
		}
	}
	return value;
}
