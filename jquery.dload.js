/** 
 * jQuery Deferred Script Loader
 *
 * @author Samuel Rouse
 * @version 0.02
 *
 * v0.02 - using() support
 * v0.01 - requirements handling
 */

/* jshint jquery:true */

(function($,undefined){
    "use strict";
    // Check for jQuery -- no point if no jQuery
    if ($ === undefined) { return false; }

    $.dload = {
        // Library References - Friendly names for file URLs
        refs: {
        	// Example references
        	"jquery":"//ajax.googleapis.com/ajax/libs/jquery/1.9.1/jquery.min.js",
        	"ui":"//ajax.googleapis.com/ajax/libs/jqueryui/1.10.2/jquery-ui.min.js"
        },
        // Library Requirements - arrays of properties in the refs object.
        reqs: {
        	// Example requirement
        	"ui": ["jquery"]
        },
        // Promise storage for $.getScript()
        defs: {
            "jquery": true  // Always loaded b/c we need it for this plugin
        },
        errs: {
            "noref": "The requested script is not in the reference table.",
            "noreq": "A required dependency is not in the reference table.",
            "badreq": "A required dependency failed to load.",
            "badres": "The requested script failed to load.",
            "unknown": "An unknown error has occurred."
        },
        fetch: function(refName){
            // First, check for an existing def so we don't waste time
            if ($.dload.defs.hasOwnProperty(refName)){
                return $.dload.defs[refName];
            }

            var myDefer = $.Deferred(),     // Deferred object to return
                promises = [];              // Promises for .when()

            // Save a promise (even if there's no reference)
            $.dload.defs[refName] = myDefer.promise();

            // See if we have this reference.
            if ($.dload.refs.hasOwnProperty(refName)){
                // Check for requirements
                if ($.dload.reqs.hasOwnProperty(refName)) {
                    var reqArray = $.dload.reqs[refName],
                        inc, reqLen = reqArray.length;

                    for (inc = 0; inc < reqLen; ++inc) {
                        promises[inc] = $.dload.fetch(reqArray[inc]);
                    }
                }

                $.when.apply($,promises).fail(function(errType){
                    if (errType === "noref" || errType === "noreq") {
                        myDefer.rejectWith(this,["noreq"]);
                    } else if (errType === "badres" || errType === "badreq") {
                        myDefer.rejectWith(this,["badreq"]);
                    } else {
                        myDefer.rejectWith(this,["unknown"]);
                    }
                }).done(function(){
                    $.getScript($.dload.refs[refName]).then(
                        function(){ myDefer.resolve(); },
                        function(){ myDefer.rejectWith(this,["badres"]); }
                    );
                });
            } else {
                // No reference? Automatica rejection
                myDefer.rejectWith(this,["noref"]);
            }

            // Pass back the promise
            return $.dload.defs[refName];
        },
        using: function(reqArray){
            // Check for the refName type... always make an array
            if (!(reqArray instanceof Array)) { reqArray = [reqArray]; }

            var promises = [],   // Array of promises
                reqLen = reqArray.length, inc;

            // Collect promises for any requirements
            for (inc = 0; inc < reqLen; ++inc) {
                promises[inc] = $.dload.fetch(reqArray[inc]);
            }

            // Return a single promise for the requirements
            return $.when.apply($,promises).promise();
        }
    };
    return true;
})(jQuery);