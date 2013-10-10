/**
 * jQuery.using() - Deferred Script Loader
 *
 * @author Samuel Rouse
 * @version 0.2.1
 *
 * v0.2.1 - cleanup
 * v0.2 - changed to public methods, code cleanup.
 * v0.1.1 - fixed .resolveWith() parameters
 * v0.1 - implemented loader plugins
 * v0.07 - added optional tests for existing URL
 * v0.06 - added noLoad to test if already loaded
 * v0.05 - added load time tracking, removed doctype checking.
 * v0.04 - major rework: multi-file, multi-type support
 * v0.03 - now in a plugin wrapper, called as $.using()
 * v0.02 - added using() function
 * v0.01 - requirements handling
 */

/* jshint jquery:true */

;(function( $, undefined ){
	"use strict";

	var settings = {
			linkStyles : false // Use link tags instead of style tags with the data
		},
		fetchModules = {
			// All plugins accept a URL and return a promise.
			// If unable to plugin
			"getScript": function(url) {
				return $.getScript(url);
			},
			"loadScript": function(url) {
				// Same as $.getScript with caching support, basically.
				return $.ajax({
					url: url,
					dataType: "script",
					cache: true,
					async: true,
					crossDomain: true
				});
			},
			"getStyle": function(url) {
				return $.ajax(url).done(function(data){
					var cssHTML;

					// Support linked stylesheets or style data on the page.
					if (settings.linkStyles) {
						cssHTML = '<link rel="stylesheet" href="' + url + '" />';
					} else {
						cssHTML = '<style type="text/css">\n' + data + "\n</style>";
					}

					$('head').append(cssHTML);
				});
			},
			"getJSON": function(url) {
				return $.getJSON(url);
			}
		},
		fetchOrder = {
			// Sequence of different modules to try; LIFO ordering
			// return a Boolean false if it should try the next module
			"script": ["getScript", "loadScript"],
			"style": ["getStyle"],
			"json": ["getJSON"]
		},
		myRefs = { // Each short name contains scripts, styles, and requirements
			"jquery": {
				styles: [],
				scripts: ["//ajax.googleapis.com/ajax/libs/jquery/1.8.3/jquery.min.js"],
				requirements: []
			},
			"ui": {
				requirements: ["jquery"]
			}
		},
		myPromises = {
			// Promise storage - both for plug-in short names and full URLs.
			"jquery":true  // Always loaded b/c we need it for this plugin
		},
		myLoadTimes = {},	// Get load times for each url called.
		messages = {
			"noval": "No reference name or script URL was passed.",
			"noref": "The requested script is not in the reference table.",
			"noreq": "A required dependency is not in the reference table.",
			"badreq": "A required dependency failed to load.",
			"badres": "The requested script failed to load.",
			"badmod": "The requested script failed to load.",
			"unknown": "An unknown error has occurred.",
			"preload": "URL already on the page."
		},
		methods = {
			modules: function(modType, modName, modFn) {
				if ( modType !== undefined && modName !== undefined && typeof modFn === "function" ) {
					fetchModules[modName] = modFn;
					if ( modType in fetchOrder ) {
						fetchOrder[modType].push(modName);
					} else {
						fetchOrder[modType] = [modName];
					}
				}
				return fetchModules;
			},
			msgs: function(msgID) {
				// Get one or all error messages
				if (typeof msgID !== "undefined") {
					return messages[msgID];
				} else {
					return messages;
				}
			},
			opts: function(options) {
				// Extend new options directly into our settings object
				if ( typeof options === "object" ) {
					settings = $.extend(true, {}, settings, options);
				}
				return settings;
			},
			promises: function(newPromises) {
				// Get/Set promises
				// It may seem strange to "set" promises,
				// but you can "complete" manually loaded scripts this way
				if (newPromises !== undefined) {
					myPromises = $.extend({}, myPromises, newPromises);
				}
				return myPromises;
			},
			refs: function(newRefs) {
				// Get/Set references
				if (newRefs !== undefined && typeof newRefs === "object") {
					myRefs = $.extend({}, myRefs, newRefs);
				}
				return myRefs;
			},
			times: function(url) {
				// Get one load time by URL or all of them
				if (typeof url !== "undefined") {
					return myLoadTimes[url];
				} else {
					return myLoadTimes;
				}
			}
		},
		trackTime = function(url, startTime) {
			myLoadTimes[url] = (new Date()).getTime() - startTime;
		},
		handleFetchError = function(myDefer, errType) {

			// adjust some error types for requirements, and not the original fetch
			if (errType === "noref" || errType === "noreq") {
				myDefer.rejectWith( this, ["noreq"] );
			} else if (errType === "badres" || errType === "badreq") {
				myDefer.rejectWith( this, ["badreq"] );
			} else {
				myDefer.rejectWith( this, ["unknown"] );
			}
		},
		fetch = function(refName){		
			// First, check for an existing def so we don't waste time
			if (myPromises.hasOwnProperty(refName)){
				return myPromises[refName];
			}

			var myDefer = $.Deferred(),		// Deferred object to return
				curPromises = [],			// Promises for .when()
				curRef = {},				// Short Reference
				srcArray = [],				// Loop scripts, styles and requirements
				srcLen,						// Length for looping
				el,							// Reference elements for looping
				inc;						// Integer for Looping

			// Save a promise immediately (even if there's no reference)
			myPromises[refName] = myDefer.promise();

			if ( refName == null ) { // Double-equal handles null or undefined
				// No reference? Automatic rejection
				myDefer.rejectWith(this,["noval"]);
			} else if (myRefs.hasOwnProperty(refName)){
			
				// See if we have this reference.
				curRef = myRefs[refName];

				// Check for noLoad function
				if ( typeof curRef.noLoad === "function" ) {
					try {
						// Run it; see if we should consider this resolved.
						if ( curRef.noLoad() ) {
							// Test says it's loaded. Resolve & return
							myDefer.resolveWith(this,["preload"]);
							return myPromises[refName];
						}
					}
					catch (e) { /* */ }
				}

				// Check for requirements, next
				if ( "requirements" in curRef &&
					curRef.requirements instanceof Array &&
					curRef.requirements.length ) {
					srcArray = curRef.requirements;
					srcLen = srcArray.length;

					// Loop through requirements and collect promises from them.
					for (inc = 0; inc < srcLen; ++inc) {
						curPromises.push( fetch( srcArray[inc] ) );
					}
				}

				for (el in curRef) {
					// if we have modules
					if ( el in curRef && el in fetchOrder && curRef[el].length ) {
						// Cycle through the reference, looking for elements we can support.

						srcArray = curRef[el];
						srcLen = srcArray.length;

						// Loop through and collect promises from them.
						for ( inc = 0; inc < srcLen; ++inc ) {
							curPromises.push( fetchURL( srcArray[inc], el ) );
						}
					}
				}

				// Apply the array of requirements to .when()
				// If it's an empty array, .when() will treat it as a success
				// Then use .fail() for error handling and .done() for Success.
				$.when.apply($,curPromises).fail(function(errType){
					handleFetchError(myDefer, errType);
				}).done(function(){

						// Our styles & requirements are complete. Get our script(s)
						if ("scripts" in curRef &&
							curRef.scripts instanceof Array &&
							curRef.scripts.length ) {
							srcArray = curRef.scripts;
							srcLen = srcArray.length;

							// Collect promises just like anything else
							for (inc = 0; inc < srcLen; ++inc) {
								curPromises.push( fetchURL( srcArray[inc], "script" ) );
							}
						}

						// Finally, apply all the promises for this reference
						$.when.apply($,curPromises).then(
							// .then() is shorthand for .done() and .fail()
							function(){ myDefer.resolveWith( this, arguments ); },
							function(){ myDefer.rejectWith( this, ["badres"] ); }
						);
					});
			} else {
				// Assume a script URL
				// We already have a defer, so pass it to fetchURL.
				fetchURL( refName, "script", myDefer ).then(
					// .then() is shorthand for .done() and .fail()
					function(){ myDefer.resolveWith( this, arguments ); },
					function(){ myDefer.rejectWith( this, ["noref"] ); }
				);
			}

			// Pass back the promise
			return myPromises[refName];
		},		
		fetchURL = function(url, type, passedDefer) {

			var fetchRes = false,
				startTime, myDefer, inc;

			if ( passedDefer === undefined ) {
				// Check for an existing request for this url and return the promise
				if ( myPromises.hasOwnProperty(url) ) { return myPromises[url]; }

				// Create the Deferred and store the promise.
				myDefer = $.Deferred();
				myPromises[url] = myDefer.promise();
			} else {
				// Defer passed in (from fetch), so use it.
				myDefer = passedDefer;
			}

			fetchRes = false;
			inc = type in fetchOrder ? fetchOrder[type].length : 0;

			while ( inc > 0 && fetchRes === false ) {
				
				// Happens first b/c length is index + 1, and makes later logic easier.
				inc--;
			
				// Get the current time for request time tracking
				// Set inside the loop so previous module errors aren't counted.
				startTime = (new Date()).getTime();

				try {
					// Try to run the module in the order for the type and sequence
					fetchRes = fetchModules[fetchOrder[type][inc]].call(this,url);
				} catch (e) { /* */ }
				
				if ( fetchRes === null ) { fetchRes = false; }
				
			}

			// Check it
			if ( fetchRes !== false ) {
				fetchRes.then(
					// .then() is shorthand for .done() and .fail()
					function(){
						trackTime(url, startTime);
						$('html').trigger("using",[type, url, fetchOrder[type][inc]]);
						myDefer.resolveWith( this, arguments );
					},
					function(){ 
						trackTime(url, startTime);
						myDefer.rejectWith( this, ["badres"] );
					}
				);
			} else {
				trackTime(url,startTime);
				// Module was unable to be loaded.
				myDefer.rejectWith( this, ["badres"] );
			}

			// Hand back the same promise we created before.
			return myPromises[url];
		},
		init = function(){

			var reqArray = arguments,
				reqLen = reqArray.length,
				reqPromises = [],	// Array of promises
				inc;

			// Collect promises for any requirements
			for (inc = 0; inc < reqLen; ++inc) {
				reqPromises[inc] = fetch(reqArray[inc]);
			}

			// Return a single promise for the requirements
			return $.when.apply($,reqPromises).promise();
		},
		publicizeMethod = function (method) {
			$.using[method] = function(){
				return methods[method].apply( null, arguments );
			};
		},
		method;

	$.using = function( ) {
		return init.apply( this, arguments );
	};
	
	// Publicize the methods, better that the slice.call pattern above
	for ( method in methods ) {
		if ( methods.hasOwnProperty(method) ) { publicizeMethod(method); }
	}
	$.using.settings = settings;
})( jQuery );
