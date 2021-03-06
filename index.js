/**********************************************************************
 * Copyright 2022 Paul Reeve <preeve@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you
 * may not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
 * implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const Notification = require("./lib/signalk-libnotification/Notification.js");

const PLUGIN_ID = "interfacewatchdog";
const PLUGIN_NAME = "Signal K interface activity watchdog";
const PLUGIN_DESCRIPTION = "Monitor a Signal K interface for anomalous drops in activity";

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";

module.exports = function(app) {
  var plugin = {};

  plugin.id = PLUGIN_ID;
  plugin.name = PLUGIN_NAME;
  plugin.description = PLUGIN_DESCRIPTION;

  const log = new Log(plugin.id, { ncallback: app.setPluginStatus, ecallback: app.setPluginError });
  const notification = new Notification(app, plugin.id, { "state": "alarm", "method": [ ] });

  plugin.schema = function() {
    var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
    return(schema.getSchema());
  };

  plugin.uiSchema = function() {
    var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
    return(schema.getSchema());
  }

  plugin.start = function(options) {
    var hasBeenActive = 0;
    var alarmIssued = 0;

    if (options) {
      log.N("monitoring '%s' (threshold = %d, reboot = %s)", options.interface, options.threshold, options.restart);
      notification.cancel(options.notificationpath);
            
      app.on('serverevent', (e) => {
        if ((e.type) && (e.type == "SERVERSTATISTICS")) {
          if (e.data.providerStatistics[options.interface].deltaRate !== undefined) {
            var throughput = e.data.providerStatistics[options.interface].deltaRate;

            // Check interface to make sure it has some activity
            if ((hasBeenActive == 0) && (throughput > 0.0)) {
              log.N("interface '%s' is alive, watchdog active", options.interface, false);
              hasBeenActive = 1;
            }
                  
            // If interface is active, then monitor throughput
            if (hasBeenActive == 1) {
              if (parseInt(throughput) <= options.threshold) {
                log.N("throughput on '%s' dropped below threshold", options.interface, false);
                if (!alarmIssued) {
                  notification.issue(options.notificationpath, "Throughput on '" + options.interface + "' dropped below threshold");
                  alarmIssued = 1;
                }
                if (options.restart) {
                  log.N("restarting Signal K", false);
                  process.exit(0);
                } 
              } else {
                if (alarmIssued) {
                  notification.cancel(options.notificationpath);
                  alarmIssued = 0;
                }
              }
            }
          }
        }
      });
    } else {
      log.E("bad or missing configuration");
    }
  }

  plugin.stop = function() {
  }

  return(plugin);
}
