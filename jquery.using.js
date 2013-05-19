/** 
 * jQuery.using() - Deferred Script Loader
 *
 * @author Samuel Rouse
 * @version 0.04
 *
 * v0.04 - major rework: multi-file, multi-type support
 * v0.03 - now in a plugin wrapper, called as $.using()
 * v0.02 - added using() function
 * v0.01 - requirements handling
 */

/* jshint jquery:true */

(function( $, undefined ){
    "use strict";

	var settings = {
            debug : false,
            linkStyles : false, // Use link tags instead of style tags with the data
            isXHTML : false,    // Doctype checking (probably excessive)
            allowXD : false,    // Permit cross-domain requests
            cacheScripts : true // Don't use $.getScript, it doesn't support caching
        },
        myRefs = { // Each short name contains scripts, styles, and requirements
            "jquery": {
                scripts: ["//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js"],
                styles: [],
                requirements: []
            },
            "ui": {
                scripts: [],
                styles: [],
                requirements: ["jquery"]
            }
        },
        myPromises = {
			// Promise storage - both for plug-in short names and full URLs.
			"jquery":true  // Always loaded b/c we need it for this plugin
		},
		errs = {
            "noref": "The requested script is not in the reference table.",
            "noreq": "A required dependency is not in the reference table.",
            "badreq": "A required dependency failed to load.",
            "badres": "The requested script failed to load.",
            "unknown": "An unknown error has occurred."
        },
		methods = {
			refs: function(newRefs) {
				// Get/Set references
				if (newRefs !== undefined) {
					myRefs = $.extend({}, myRefs, newRefs);
				}
				return myRefs;
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
			errs: function(err) {
				return errs[err];
			},
            opts: function(options) {
                // Extend new options directly into our options object
                if ( typeof options === "object" ) {
                   settings = $.extend(true, {}, settings, options);
                }
                return settings;
            }
        },
        fetch = function(refName){
            // First, check for an existing def so we don't waste time
            if (myPromises.hasOwnProperty(refName)){
                return myPromises[refName];
            }

            var myDefer = $.Deferred(),     // Deferred object to return
                curPromises = [],           // Promises for .when()
                curRef = {},                 // Short Reference
                srcArray = [],              // Loop scripts, styles and requirements
                srcLen,                     // Length for looping
                inc;                        // Integer for Looping

            // Save a promise immediately (even if there's no reference)
            myPromises[refName] = myDefer.promise();

            // See if we have this reference.
            if (myRefs.hasOwnProperty(refName)){
                curRef = myRefs[refName];

                // Start with styles, so they are there before the scripts run
                if ( curRef.hasOwnProperty("styles") &&
                        curRef.styles instanceof Array &&
                        curRef.styles.length ) {
                    srcArray = curRef.styles;
                    srcLen = srcArray.length;

                    // Loop through requirements and collect promises from them.
                    for ( inc = 0; inc < srcLen; ++inc ) {
                        curPromises.push( fetchURL( srcArray[inc], "style" ) );
                    }
                }

                // Check for requirements, next
                if ( curRef.hasOwnProperty("requirements") &&
                        curRef.requirements instanceof Array &&
                        curRef.requirements.length ) {
                    srcArray = curRef.requirements;
                    srcLen = srcArray.length;

                    // Loop through requirements and collect promises from them.
                    for (inc = 0; inc < srcLen; ++inc) {
                        curPromises.push( fetch( srcArray[inc] ) );
                    }
                }

                // Apply the array of requirements to .when()
                // If it's an empty array, .when() will treat it as a success
                // Then use .fail() for error handling and .done() for Success.
                $.when.apply($,curPromises).fail(function(errType){
                    handleFetchError(refName, myDefer, errType);
                }).done(function(){

                    // Our styles & requirements are complete. Get our script(s)
                    if (curRef.hasOwnProperty("scripts") && curRef.scripts instanceof Array && curRef.scripts.length ) {
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
                        function(){ myDefer.resolve(); },
                        function(){ myDefer.rejectWith(this,["badres"]); }
                    );
                });
            } else {
                // No reference? Automatic rejection
                myDefer.rejectWith(this,["noref"]);
            }

            // Pass back the promise
            return myPromises[refName];
        },
        fetchURL = function(url, itemType) {
            // Check for an existing request for this url and return the promise
            if ( myPromises.hasOwnProperty(url) ) { return myPromises[url]; }

            // Create the Deferred and store the promise.
            var myDefer = new $.Deferred();
            myPromises[url] = myDefer.promise();

            // Make the request
            if (itemType === "script") {
                $.ajax({
                    url: url,
                    dataType: "script",
                    cache: !!(settings.cacheScripts),
                    async: true,
                    crossDomain: !!(settings.allowXD)
                }).then(
                    // .then() is shorthand for .done() and .fail()
                    function(){ myDefer.resolve(); },
                    function(){ myDefer.rejectWith( this, ["badres"] ); }
                );
            } else if (itemType === "style") {
                $.ajax(url).then(
                    // .then() is shorthand for .done() and .fail()
                    function(data){
                        addStyles(data);
                        myDefer.resolve(); },
                    function(){ myDefer.rejectWith( this, ["badres"] ); }
                );
            }

            // Hand back the same promise we created before.
            return myPromises[url];
        },
        addStyles = function(url, data) {
            var cssHTML;

            // Support both linked stylesheets and style data on the page.
            if (settings.linkStyles) {
                cssHTML = '<link rel="stylesheet" href="' + url + '"' + ( settings.isXHTML ? " />" : ">" );
            } else {
                cssHTML = '<style' + ( settings.isXHTML ? ' type="text/css"' : "" ) +  ">\n" + data + "\n</style>";
            }

            $('head').append(cssHTML);
        },
        handleFetchError = function(refName, myDefer, errType) {

            // adjust some error types for requirements, and not the original fetch
            if (errType === "noref" || errType === "noreq") {
                myDefer.rejectWith(this,["noreq"]);
            } else if (errType === "badres" || errType === "badreq") {
                myDefer.rejectWith(this,["badreq"]);
            } else {
                myDefer.rejectWith(this,["unknown"]);
            }
        },
        init = function(reqArray){
            // Check for the refName type... always make an array
            if (!(reqArray instanceof Array)) { reqArray = [reqArray]; }

            var reqPromises = [],   // Array of promises
                reqLen = reqArray.length, inc;

            // Collect promises for any requirements
            for (inc = 0; inc < reqLen; ++inc) {
                reqPromises[inc] = fetch(reqArray[inc]);
            }

            // Return a single promise for the requirements
            return $.when.apply($,reqPromises).promise();
        };

	$.using = function( method ) {
    
		// Method calling logic
		if ( methods[method] ) {
			return methods[ method ].apply( this, Array.prototype.slice.call( arguments, 1 ));
		} else {
			return init.apply( this, arguments );
		}   
	};

    // Tests for doctype. This could throw errors.
    try {
        // Internet Explorer tests first
        if (typeof document.documentElement.previousSibling.nodeValue !== "null" &&
            document.documentElement.previousSibling.nodeValue.toLowerCase().indexOf("xhtml") !== -1) {
            settings.isXHTML = true;
        } else if (document.documentElement.previousSibling.valueOf().toLowerCase().indexOf() !== -1) {
            settings.isXHTML = true;
        }
    } catch (e) { settings.errCount++; }
})( jQuery );
