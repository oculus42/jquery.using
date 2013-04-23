/** 
 * jQuery.using() - Deferred Script Loader
 *
 * @author Samuel Rouse
 * @version 0.03
 *
 * v0.03 - now in a plugin wrapper, called as $.using()
 * v0.02 - added using() function
 * v0.01 - requirements handling
 */

/* jshint jquery:true */

(function( $, undefined ){
    "use strict";

	var debug = false,
		refs = {
			// Library References - Friendly names for file URLs
			// Example references
			"jquery":"//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js",
			"ui":"//ajax.googleapis.com/ajax/libs/jqueryui/1.10.2/jquery-ui.min.js"
		},
		reqs = {
			// Library Requirements - arrays of properties in the refs object.
			// Example requirement
			"ui": ["jquery"]
		},
		defs = {	
			// Promise storage for $.getScript()
			"jquery":true  // Always loaded b/c we need it for this plugin
			// if there are scripts we know this page loads, we can access this object and add "promises" for them.
		},
		errs = {
            "noref": "The requested script is not in the reference table.",
            "noreq": "A required dependency is not in the reference table.",
            "badreq": "A required dependency failed to load.",
            "badres": "The requested script failed to load.",
            "unknown": "An unknown error has occurred."
        },
		methods = {
			debug: function(setDebug) {
				// Set the debug flag
				debug = (setDebug === true ? true : false);
				return debug;
			},
			refs: function(newRefs) {
				// Get/Set references
				if (newRefs !== undefined) {
					refs = $.extend({}, refs, newRefs);
				}
				return refs;
			},
			reqs: function(newReqs) {
				// Get/Set requirements
				if (newReqs !== undefined) {
					reqs = $.extend({}, reqs, newReqs);
				}
				return reqs;
			},
			defs: function(newDefs) {
				// Get/Set Deferred promises
				// It may seem strange to "set" promises, 
				// but you can "complete" manually loaded scripts this way				
				if (newDefs !== undefined) {
					defs = $.extend({}, defs, newDefs);
				}
				return defs;
			},
			errs: function(err) {
				return errs[err];
			},
			fetch: function(refName){
				// First, check for an existing def so we don't waste time
				if (defs.hasOwnProperty(refName)){
					return defs[refName];
				}

				var myDefer = $.Deferred(),     // Deferred object to return
					promises = [];              // Promises for .when()

				// Save a promise immediately (even if there's no reference)
				defs[refName] = myDefer.promise();

				// See if we have this reference.
				if (refs.hasOwnProperty(refName)){
					// Check for requirements
					if (reqs.hasOwnProperty(refName)) {
						var reqArray = reqs[refName],
							inc, reqLen = reqArray.length;

						// Recurse through our requirements and collect promises from them.
						for (inc = 0; inc < reqLen; ++inc) {
							promises[inc] = methods.fetch(reqArray[inc]);
						}
					}

					//Logging
					if (debug) {
						console.log("$.using(\"fetch\", " + refName + ") - " + (reqs[refName] ? reqs[refName] : ""));
					}
					
					// Apply the array of requirements to .when()
					// If it's an empty array, .when() will treat it as a success
					// Then use .fail() for error handling and .done() for Success.
					$.when.apply($,promises).fail(function(errType){
						// Logging
						if (debug) { console.log("$.using(\"fetch\", " + refName + ") Failed with " + errType); }
						
						// adjust some error types for requirements, and not the original fetch
						if (errType === "noref" || errType === "noreq") {
							myDefer.rejectWith(this,["noreq"]);
						} else if (errType === "badres" || errType === "badreq") {
							myDefer.rejectWith(this,["badreq"]);
						} else {
							myDefer.rejectWith(this,["unknown"]);
						}
					}).done(function(){
						// Logging
						if (debug) { console.log("$.using(\"fetch\", " + refName + ") Succeeded"); }
					
						// Our requirements are complete, make the actual script call.
						$.getScript(refs[refName]).then(
							// .then() is shorthand for .done() and .fail()
							function(){ myDefer.resolve(); },
							function(){ myDefer.rejectWith(this,["badres"]); }
						);
					});
				} else {
					// No reference? Automatic rejection
					myDefer.rejectWith(this,["noref"]);
				}

				// Pass back the promise
				return defs[refName];
			},
			init: function(reqArray){
				// Check for the refName type... always make an array
				if (!(reqArray instanceof Array)) { reqArray = [reqArray]; }

				var promises = [],   // Array of promises
					reqLen = reqArray.length, inc;

				// Collect promises for any requirements
				for (inc = 0; inc < reqLen; ++inc) {
					promises[inc] = methods.fetch(reqArray[inc]);
				}

				// Return a single promise for the requirements
				return $.when.apply($,promises).promise();
			}
		};

	$.using = function( method ) {
    
		// Method calling logic
		if ( methods[method] ) {
			return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else {
			return methods.init.apply( this, arguments );
		}   
	};
})( jQuery );
