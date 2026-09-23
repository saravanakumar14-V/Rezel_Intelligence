var Rezel = (function() {
  
  function getStatus() {
    try {
      var status = {
        success: true,
        projectOpen: app.project !== null,
        numItems: app.project ? app.project.items.length : 0,
        activeItemName: (app.project && app.project.activeItem) ? app.project.activeItem.name : null,
        appName: app.name,
        appVersion: app.version
      };
      
      // We must stringify JSON for CSInterface to pass it back safely.
      // ExtendScript doesn't have native JSON, so we build a simple stringifier for our known schemas.
      return '{ "success": ' + status.success + ', ' +
             '"projectOpen": ' + status.projectOpen + ', ' +
             '"numItems": ' + status.numItems + ', ' +
             '"activeItemName": ' + (status.activeItemName ? '"' + status.activeItemName + '"' : 'null') + ', ' +
             '"appName": "' + status.appName + '", ' +
             '"appVersion": "' + status.appVersion + '" }';
    } catch (e) {
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function getCompById(id) {
    if (!app.project) return null;
    for (var i = 1; i <= app.project.items.length; i++) {
      var item = app.project.items[i];
      if (item instanceof CompItem && item.id === id) {
        return item;
      }
    }
    return null;
  }

  function createComp(name, width, height, pixelAspect, duration, frameRate) {
    try {
      app.beginUndoGroup("Rezel: Create Comp");
      if (!app.project) {
        app.newProject();
      }
      var comp = app.project.items.addComp(name, width, height, pixelAspect, duration, frameRate);
      app.endUndoGroup();

      // Structural Verification
      var verifyComp = getCompById(comp.id);
      if (verifyComp && verifyComp.name === name) {
        return '{ "success": true, "compId": ' + comp.id + ', "name": "' + name + '" }';
      } else {
        return '{ "success": false, "error": "Verification failed: Comp was not created correctly" }';
      }
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function addTextLayer(compId, text, font, fontSize, fillColor) {
    try {
      app.beginUndoGroup("Rezel: Add Text Layer");
      var comp = getCompById(compId);
      if (!comp) {
        throw new Error("Composition with ID " + compId + " not found");
      }

      var textLayer = comp.layers.addText(text);
      var textProp = textLayer.property("Source Text");
      var textDocument = textProp.value;

      var modified = false;
      if (font !== null) { textDocument.font = font; modified = true; }
      if (fontSize !== null) { textDocument.fontSize = fontSize; modified = true; }
      if (fillColor !== null) { 
        textDocument.fillColor = fillColor; 
        textDocument.applyFill = true; 
        modified = true; 
      }
      
      if (modified) {
        textProp.setValue(textDocument);
      }
      app.endUndoGroup();

      // Structural Verification
      var verifyLayer = comp.layer(1);
      if (verifyLayer && verifyLayer instanceof TextLayer && verifyLayer.property("Source Text").value.text === text) {
        return '{ "success": true, "layerIndex": ' + verifyLayer.index + ', "compId": ' + compId + ' }';
      } else {
        return '{ "success": false, "error": "Verification failed: Text layer not created correctly" }';
      }
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function createProject() {
    try {
      if (app.project) {
        app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);
      }
      app.newProject();

      // Structural Verification
      if (app.project !== null) {
        return '{ "success": true }';
      } else {
        return '{ "success": false, "error": "Verification failed: app.project is null after newProject" }';
      }
    } catch (e) {
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function setTransform(compId, layerIndex, position, scale, rotation, opacity) {
    try {
      app.beginUndoGroup("Rezel: Set Transform");
      var comp = getCompById(compId);
      if (!comp) throw new Error("Composition with ID " + compId + " not found");
      
      var layer = comp.layer(layerIndex);
      if (!layer) throw new Error("Layer at index " + layerIndex + " not found");

      if (position !== null) layer.property("Position").setValue(position);
      if (scale !== null) layer.property("Scale").setValue(scale);
      if (rotation !== null) layer.property("Rotation").setValue(rotation);
      if (opacity !== null) layer.property("Opacity").setValue(opacity);

      app.endUndoGroup();

      // Post-Mutation Structural Verification
      function approxEqual(a, b) { return Math.abs(a - b) < 0.01; }
      function verifyArray(propName, expected) {
        if (expected === null) return true;
        var actual = layer.property(propName).value;
        for (var i = 0; i < expected.length; i++) {
          if (!approxEqual(actual[i], expected[i])) return false;
        }
        return true;
      }
      function verifyNumber(propName, expected) {
        if (expected === null) return true;
        return approxEqual(layer.property(propName).value, expected);
      }

      if (!verifyArray("Position", position)) return '{ "success": false, "error": "Verification failed for Position" }';
      if (!verifyArray("Scale", scale)) return '{ "success": false, "error": "Verification failed for Scale" }';
      if (!verifyNumber("Rotation", rotation)) return '{ "success": false, "error": "Verification failed for Rotation" }';
      if (!verifyNumber("Opacity", opacity)) return '{ "success": false, "error": "Verification failed for Opacity" }';

      return '{ "success": true }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function saveProject(pathString) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }
      
      var fileObj = new File(pathString);
      app.project.save(fileObj);

      // Post-save verification
      if (app.project.file === null) {
        return '{ "success": false, "error": "Verification failed: app.project.file is null after save" }';
      }

      // Normalize paths for comparison (replace backslashes with forward slashes for AE File object consistency)
      var requestedNorm = pathString.replace(/\\/g, '/').toLowerCase();
      var actualNorm = app.project.file.fsName.replace(/\\/g, '/').toLowerCase();

      if (requestedNorm !== actualNorm) {
        return '{ "success": false, "error": "Verification failed: Saved project path does not match requested path" }';
      }

      return '{ "success": true, "path": "' + app.project.file.fsName.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '" }';
    } catch (e) {
      return '{ "success": false, "error": "' + e.toString().replace(/"/g, '\\"') + '" }';
    }
  }

  function escapeJSON(str) {
    if (str === null || str === undefined) return "null";
    return '"' + str.toString().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
  }

  function getLayerType(layer) {
    if (layer instanceof TextLayer) return "text";
    if (layer instanceof ShapeLayer) return "shape";
    if (layer instanceof CameraLayer) return "camera";
    if (layer instanceof LightLayer) return "light";
    if (layer instanceof AVLayer) {
      if (layer.adjustmentLayer) return "adjustment";
      if (layer.nullLayer) return "null";
      if (layer.source) {
        if (layer.source instanceof CompItem) return "precomp";
        if (layer.source.mainSource && layer.source.mainSource.color) return "solid";
        return "footage";
      }
    }
    return "unknown";
  }

  function inspectProject() {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var projectData = {
        projectOpen: true,
        name: app.project.file ? app.project.file.name : "Untitled",
        path: app.project.file ? app.project.file.fsName : null,
        numItems: app.project.items.length
      };

      var jsonStr = '{';
      jsonStr += '"success": true, ';
      jsonStr += '"project": {';
      jsonStr += '"open": true, ';
      jsonStr += '"name": ' + escapeJSON(projectData.name) + ', ';
      jsonStr += '"path": ' + escapeJSON(projectData.path) + ', ';
      jsonStr += '"numItems": ' + projectData.numItems;
      jsonStr += '}, ';
      
      jsonStr += '"compositions": [';
      
      var compFound = false;
      for (var i = 1; i <= app.project.items.length; i++) {
        var item = app.project.items[i];
        if (item instanceof CompItem) {
          if (compFound) jsonStr += ', ';
          compFound = true;
          
          jsonStr += '{';
          jsonStr += '"id": ' + item.id + ', ';
          jsonStr += '"name": ' + escapeJSON(item.name) + ', ';
          jsonStr += '"width": ' + item.width + ', ';
          jsonStr += '"height": ' + item.height + ', ';
          jsonStr += '"duration": ' + item.duration + ', ';
          jsonStr += '"frameRate": ' + item.frameRate + ', ';
          
          jsonStr += '"layers": [';
          var layerFound = false;
          for (var j = 1; j <= item.layers.length; j++) {
            var layer = item.layers[j];
            if (layerFound) jsonStr += ', ';
            layerFound = true;
            
            var parentIndex = layer.parent ? layer.parent.index : null;
            
            jsonStr += '{';
            jsonStr += '"index": ' + layer.index + ', ';
            jsonStr += '"name": ' + escapeJSON(layer.name) + ', ';
            jsonStr += '"type": ' + escapeJSON(getLayerType(layer)) + ', ';
            jsonStr += '"enabled": ' + layer.enabled + ', ';
            jsonStr += '"inPoint": ' + layer.inPoint + ', ';
            jsonStr += '"outPoint": ' + layer.outPoint + ', ';
            jsonStr += '"parentIndex": ' + parentIndex;
            jsonStr += '}';
          }
          jsonStr += ']'; // End layers array
          jsonStr += '}'; // End comp object
        }
      }
      
      jsonStr += ']'; // End compositions array
      jsonStr += '}'; // End root object

      // Verify it's valid JSON
      try {
        var testParse = eval('(' + jsonStr + ')');
        if (!testParse.success) throw new Error("JSON serialization failed validation");
      } catch (err) {
        return '{ "success": false, "error": "Internal JSON serialization error: ' + escapeJSON(err.toString()) + '" }';
      }

      return jsonStr;
    } catch (e) {
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function resolveProperty(layer, propertyPath) {
    if (!layer || !propertyPath) return null;
    var parts = propertyPath.split('.');
    var current = layer;
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (current.property) {
        var next = null;
        if (/^\d+$/.test(part)) {
          var idx = parseInt(part, 10);
          if (idx >= 1 && idx <= current.numProperties) {
            next = current.property(idx);
          }
        }
        if (!next) {
          next = current.property(part);
        }
        if (!next && part === 'AnchorPoint') next = current.property('Anchor Point');
        if (!next && part === 'Effects') next = current.property('ADBE Effect Parade');
        if (!next && part === 'ADBE Effect Parade') next = current.property('Effects');
        if (!next) return null;
        current = next;
      } else {
        return null;
      }
    }
    return current;
  }

  function mapPropertyValueType(prop) {
    if (!prop) return "UNKNOWN";
    try {
      if (typeof prop.propertyValueType === 'undefined') return "UNKNOWN";
      var vt = prop.propertyValueType;
      if (vt === PropertyValueType.OneD) return "NUMBER";
      if (vt === PropertyValueType.TwoD || vt === PropertyValueType.TwoD_SPATIAL ||
          vt === PropertyValueType.ThreeD || vt === PropertyValueType.ThreeD_SPATIAL) return "VECTOR";
      if (vt === PropertyValueType.COLOR) return "COLOR";
      if (vt === PropertyValueType.CUSTOM_VALUE) return "UNKNOWN";
      if (vt === PropertyValueType.NO_VALUE) return "UNKNOWN";
      if (vt === PropertyValueType.LAYER_INDEX) return "NUMBER";
      if (vt === PropertyValueType.MASK_INDEX) return "NUMBER";
      if (vt === PropertyValueType.SHAPE) return "UNKNOWN";
      if (vt === PropertyValueType.TEXT_DOCUMENT) return "TEXT";
      return "NUMBER";
    } catch (e) {
      return "UNKNOWN";
    }
  }

  function serializeKeyframeValue(val) {
    if (val === null || val === undefined) return "null";
    if (typeof val === 'number') return val.toString();
    if (typeof val === 'boolean') return val.toString();
    if (val instanceof Array) {
      var items = [];
      for (var i = 0; i < val.length; i++) {
        items.push(val[i]);
      }
      return '[' + items.join(',') + ']';
    }
    return escapeJSON(val.toString());
  }

  function inspectTimeline(compId, layerIndex, propertyPath, maxProperties, maxKeyframes) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var comp = compId ? getCompById(compId) : (app.project.activeItem instanceof CompItem ? app.project.activeItem : null);
      if (!comp) {
        return '{ "success": false, "error": "No active composition found", "code": "NO_ACTIVE_COMPOSITION" }';
      }

      var layer = null;
      if (layerIndex) {
        layer = comp.layer(layerIndex);
      } else if (comp.selectedLayers && comp.selectedLayers.length > 0) {
        layer = comp.selectedLayers[0];
      } else if (comp.numLayers > 0) {
        layer = comp.layer(1);
      }

      if (!layer) {
        return '{ "success": false, "error": "No layer found in composition", "code": "LAYER_NOT_FOUND" }';
      }

      var maxProps = maxProperties || 50;
      var maxKeys = maxKeyframes || 200;
      var isTruncated = false;

      var pathsToCheck = [];
      if (propertyPath) {
        pathsToCheck.push(propertyPath);
      } else {
        pathsToCheck = [
          "Transform.Position",
          "Transform.Scale",
          "Transform.Rotation",
          "Transform.Opacity",
          "Transform.Anchor Point"
        ];
      }

      var jsonStr = '{';
      jsonStr += '"success": true, ';
      jsonStr += '"compositionId": ' + comp.id + ', ';
      jsonStr += '"layerId": ' + escapeJSON(layer.name + "_" + layer.index) + ', ';
      jsonStr += '"layerIndex": ' + layer.index + ', ';
      jsonStr += '"currentTime": ' + comp.time + ', ';
      jsonStr += '"properties": [';

      var propFound = false;
      var propCount = 0;

      for (var i = 0; i < pathsToCheck.length; i++) {
        if (propCount >= maxProps) {
          isTruncated = true;
          break;
        }

        var pPath = pathsToCheck[i];
        var prop = resolveProperty(layer, pPath);
        if (!prop) continue;

        if (propFound) jsonStr += ', ';
        propFound = true;
        propCount++;

        var valueType = mapPropertyValueType(prop);
        var animated = prop.numKeys > 0;

        jsonStr += '{';
        jsonStr += '"propertyPath": ' + escapeJSON(pPath) + ', ';
        jsonStr += '"displayName": ' + escapeJSON(prop.name) + ', ';
        jsonStr += '"valueType": ' + escapeJSON(valueType) + ', ';
        jsonStr += '"animated": ' + animated + ', ';
        jsonStr += '"keyframes": [';

        var keyFound = false;
        var keyLimit = Math.min(prop.numKeys, maxKeys);
        if (prop.numKeys > maxKeys) {
          isTruncated = true;
        }

        for (var k = 1; k <= keyLimit; k++) {
          if (keyFound) jsonStr += ', ';
          keyFound = true;

          jsonStr += '{';
          jsonStr += '"time": ' + prop.keyTime(k) + ', ';
          jsonStr += '"value": ' + serializeKeyframeValue(prop.keyValue(k));
          jsonStr += '}';
        }

        jsonStr += ']'; // End keyframes
        jsonStr += '}'; // End property
      }

      jsonStr += '], ';
      jsonStr += '"isTruncated": ' + isTruncated;
      jsonStr += '}';

      return jsonStr;
    } catch (e) {
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function addKeyframe(compId, layerIndex, propertyPath, time, value) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var comp = getCompById(compId);
      if (!comp) return '{ "success": false, "error": "Composition with ID " + compId + " not found" }';

      var layer = comp.layer(layerIndex);
      if (!layer) return '{ "success": false, "error": "Layer at index " + layerIndex + " not found" }';

      var prop = resolveProperty(layer, propertyPath);
      if (!prop) {
        return '{ "success": false, "error": "Property not found: " + propertyPath, "code": "PROPERTY_NOT_FOUND" }';
      }

      if (!prop.canVaryOverTime) {
        return '{ "success": false, "error": "Property does not support keyframes: " + propertyPath, "code": "PROPERTY_UNSUPPORTED" }';
      }

      if (time < 0 || isNaN(time) || !isFinite(time)) {
        return '{ "success": false, "error": "Invalid keyframe time: " + time }';
      }

      app.beginUndoGroup("Rezel: Add Keyframe");
      prop.setValueAtTime(time, value);
      app.endUndoGroup();

      // Verify keyframe exists at time
      var verifyTime = prop.valueAtTime(time, false);
      return '{ "success": true, "propertyPath": ' + escapeJSON(propertyPath) + ', "time": ' + time + ', "value": ' + serializeKeyframeValue(verifyTime) + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function setKeyframeValue(compId, layerIndex, propertyPath, time, value) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var comp = getCompById(compId);
      if (!comp) return '{ "success": false, "error": "Composition with ID " + compId + " not found" }';

      var layer = comp.layer(layerIndex);
      if (!layer) return '{ "success": false, "error": "Layer at index " + layerIndex + " not found" }';

      var prop = resolveProperty(layer, propertyPath);
      if (!prop) {
        return '{ "success": false, "error": "Property not found: " + propertyPath, "code": "PROPERTY_NOT_FOUND" }';
      }

      if (prop.numKeys === 0) {
        return '{ "success": false, "error": "Property is not animated: " + propertyPath, "code": "KEYFRAME_NOT_FOUND" }';
      }

      var targetKeyIndex = -1;
      for (var k = 1; k <= prop.numKeys; k++) {
        if (Math.abs(prop.keyTime(k) - time) < 0.01) {
          targetKeyIndex = k;
          break;
        }
      }

      if (targetKeyIndex === -1) {
        return '{ "success": false, "error": "No keyframe found at time " + time, "code": "KEYFRAME_NOT_FOUND" }';
      }

      app.beginUndoGroup("Rezel: Set Keyframe Value");
      prop.setValueAtKey(targetKeyIndex, value);
      app.endUndoGroup();

      var actualValue = prop.keyValue(targetKeyIndex);
      return '{ "success": true, "propertyPath": ' + escapeJSON(propertyPath) + ', "time": ' + prop.keyTime(targetKeyIndex) + ', "value": ' + serializeKeyframeValue(actualValue) + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function inspectEffects(compId, layerIndex, maxEffects, maxPropertiesPerEffect) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var comp = compId ? getCompById(compId) : (app.project.activeItem instanceof CompItem ? app.project.activeItem : null);
      if (!comp) {
        return '{ "success": false, "error": "No active composition found", "code": "NO_ACTIVE_COMPOSITION" }';
      }

      var layer = null;
      if (layerIndex) {
        layer = comp.layer(layerIndex);
      } else if (comp.selectedLayers && comp.selectedLayers.length > 0) {
        layer = comp.selectedLayers[0];
      } else if (comp.numLayers > 0) {
        layer = comp.layer(1);
      }

      if (!layer) {
        return '{ "success": false, "error": "No layer found in composition", "code": "LAYER_NOT_FOUND" }';
      }

      var maxEff = maxEffects || 50;
      var maxProps = maxPropertiesPerEffect || 100;
      var isTruncated = false;

      var effectParade = layer.property("ADBE Effect Parade") || layer.property("Effects");
      var numEffects = effectParade ? effectParade.numProperties : 0;

      var jsonStr = '{';
      jsonStr += '"success": true, ';
      jsonStr += '"compositionId": ' + comp.id + ', ';
      jsonStr += '"layerId": ' + escapeJSON(layer.name + "_" + layer.index) + ', ';
      jsonStr += '"layerIndex": ' + layer.index + ', ';
      jsonStr += '"effects": [';

      var effFound = false;
      var effCount = 0;
      var matchNameCounts = {};

      if (effectParade && numEffects > 0) {
        for (var i = 1; i <= numEffects; i++) {
          if (effCount >= maxEff) {
            isTruncated = true;
            break;
          }

          var eff = effectParade.property(i);
          if (!eff) continue;

          var mName = eff.matchName || "UNKNOWN_EFFECT";
          if (!matchNameCounts[mName]) {
            matchNameCounts[mName] = 1;
          } else {
            matchNameCounts[mName]++;
          }
          var occIndex = matchNameCounts[mName];
          var effIdentity = layer.name + "_" + layer.index + "_" + mName + "_" + occIndex;

          if (effFound) jsonStr += ', ';
          effFound = true;
          effCount++;

          jsonStr += '{';
          jsonStr += '"identity": ' + escapeJSON(effIdentity) + ', ';
          jsonStr += '"name": ' + escapeJSON(eff.name) + ', ';
          jsonStr += '"matchName": ' + escapeJSON(mName) + ', ';
          jsonStr += '"occurrenceIndex": ' + occIndex + ', ';
          jsonStr += '"enabled": ' + (eff.enabled !== false) + ', ';
          jsonStr += '"numProperties": ' + (eff.numProperties || 0) + ', ';
          jsonStr += '"properties": [';

          var propFound = false;
          var propCount = 0;
          var effNumProps = eff.numProperties || 0;

          for (var p = 1; p <= effNumProps; p++) {
            if (propCount >= maxProps) {
              isTruncated = true;
              break;
            }

            var prop = eff.property(p);
            if (!prop) continue;

            if (propFound) jsonStr += ', ';
            propFound = true;
            propCount++;

            var pPath = "Effects." + eff.name + "." + prop.name;
            var vType = mapPropertyValueType(prop);
            var isAnim = prop.numKeys > 0 || (prop.canVaryOverTime && prop.isTimeVarying);
            var hasVal = typeof prop.value !== 'undefined';
            var valStr = hasVal ? serializeKeyframeValue(prop.value) : "null";
            var minVal = (prop.hasMin && typeof prop.minValue === 'number') ? prop.minValue : "null";
            var maxVal = (prop.hasMax && typeof prop.maxValue === 'number') ? prop.maxValue : "null";

            jsonStr += '{';
            jsonStr += '"propertyPath": ' + escapeJSON(pPath) + ', ';
            jsonStr += '"displayName": ' + escapeJSON(prop.name) + ', ';
            jsonStr += '"valueType": ' + escapeJSON(vType) + ', ';
            jsonStr += '"value": ' + valStr + ', ';
            jsonStr += '"animated": ' + isAnim + ', ';
            jsonStr += '"minValue": ' + minVal + ', ';
            jsonStr += '"maxValue": ' + maxVal;
            jsonStr += '}';
          }

          jsonStr += ']'; // End properties
          jsonStr += '}'; // End effect
        }
      }

      jsonStr += '], ';
      jsonStr += '"isTruncated": ' + isTruncated;
      jsonStr += '}';

      return jsonStr;
    } catch (e) {
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function setPropertyValue(compId, layerIndex, propertyPath, value, expectedMatchName, occurrenceIndex) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No project is currently open" }';
      }

      var comp = getCompById(compId);
      if (!comp) return '{ "success": false, "error": "Composition with ID " + compId + " not found" }';

      var layer = comp.layer(layerIndex);
      if (!layer) return '{ "success": false, "error": "Layer at index " + layerIndex + " not found" }';

      var prop = resolveProperty(layer, propertyPath);
      if (!prop) {
        return '{ "success": false, "error": "Property not found: " + propertyPath, "code": "PROPERTY_NOT_FOUND" }';
      }

      // Check if property is animated
      if (prop.numKeys > 0 || (prop.canVaryOverTime && prop.isTimeVarying)) {
        return '{ "success": false, "error": "Property is animated. Use timeline/keyframe operations (13.3.4)", "code": "PROPERTY_ANIMATED" }';
      }

      // Check if property is writable
      if (typeof prop.setValue !== 'function') {
        return '{ "success": false, "error": "Property is read-only or unsupported for mutation", "code": "PROPERTY_UNSUPPORTED" }';
      }

      // Check if numeric / vector value contains NaN or Infinity
      if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) {
        return '{ "success": false, "error": "Invalid numeric value: " + value, "code": "INVALID_PARAMETERS" }';
      }
      if (value instanceof Array) {
        for (var vi = 0; vi < value.length; vi++) {
          if (typeof value[vi] === 'number' && (isNaN(value[vi]) || !isFinite(value[vi]))) {
            return '{ "success": false, "error": "Vector contains invalid numbers", "code": "INVALID_PARAMETERS" }';
          }
        }
      }

      // Range validation
      if (prop.hasMin && typeof prop.minValue === 'number' && typeof value === 'number' && value < prop.minValue) {
        return '{ "success": false, "error": "Value " + value + " is less than minimum allowed " + prop.minValue, "code": "INVALID_PARAMETERS" }';
      }
      if (prop.hasMax && typeof prop.maxValue === 'number' && typeof value === 'number' && value > prop.maxValue) {
        return '{ "success": false, "error": "Value " + value + " is greater than maximum allowed " + prop.maxValue, "code": "INVALID_PARAMETERS" }';
      }

      app.beginUndoGroup("Rezel: Set Effect Property");
      prop.setValue(value);
      app.endUndoGroup();

      var actualValue = prop.value;
      return '{ "success": true, "propertyPath": ' + escapeJSON(propertyPath) + ', "value": ' + serializeKeyframeValue(actualValue) + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function mapRQStatus(status) {
    if (typeof RQItemStatus === 'undefined') return "UNKNOWN";
    if (status === RQItemStatus.QUEUED) return "QUEUED";
    if (status === RQItemStatus.UNQUEUED || status === RQItemStatus.NEEDS_OUTPUT || status === RQItemStatus.WILL_CONTINUE) return "UNQUEUED";
    if (status === RQItemStatus.DONE) return "DONE";
    if (status === RQItemStatus.USER_STOPPED) return "USER_STOPPED";
    if (status === RQItemStatus.ERR_STOPPED) return "ERR_STOPPED";
    if (status === RQItemStatus.RENDERING) return "QUEUED";
    return "UNKNOWN";
  }

  function inspectRenderQueue(maxItems) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No active project", "code": "PROJECT_NOT_OPEN" }';
      }

      var limit = (typeof maxItems === 'number' && maxItems > 0) ? Math.min(maxItems, 500) : 100;
      var rq = app.project.renderQueue;
      var totalItems = rq ? rq.numItems : 0;
      var isTruncated = totalItems > limit;
      var count = isTruncated ? limit : totalItems;

      var itemsJson = [];
      for (var i = 1; i <= count; i++) {
        var item = rq.item(i);
        if (!item) continue;

        var compId = (item.comp && typeof item.comp.id === 'number') ? String(item.comp.id) : null;
        var compName = item.comp ? item.comp.name : null;
        var st = mapRQStatus(item.status);
        var outPath = null;
        if (item.numOutputModules > 0) {
          var om = item.outputModule(1);
          if (om && om.file) {
            outPath = om.file.fsName || om.file.absoluteURI || om.file.fullName || null;
          }
        }

        var itemEntry = '{ "index": ' + i + ', ' +
                        '"compositionId": ' + (compId ? escapeJSON(compId) : 'null') + ', ' +
                        '"compositionName": ' + (compName ? escapeJSON(compName) : 'null') + ', ' +
                        '"status": ' + escapeJSON(st) + ', ' +
                        '"outputFilePath": ' + (outPath ? escapeJSON(outPath) : 'null') + ' }';
        itemsJson.push(itemEntry);
      }

      return '{ "success": true, ' +
             '"status": "ACTIVE_PROJECT", ' +
             '"totalItems": ' + totalItems + ', ' +
             '"isTruncated": ' + (isTruncated ? 'true' : 'false') + ', ' +
             '"items": [' + itemsJson.join(', ') + '] }';
    } catch (e) {
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function addToRenderQueue(compId) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No active project", "code": "PROJECT_NOT_OPEN" }';
      }

      var comp = null;
      if (compId !== null && compId !== undefined && compId !== "null" && compId !== "") {
        comp = getCompById(Number(compId));
      } else if (app.project.activeItem instanceof CompItem) {
        comp = app.project.activeItem;
      }

      if (!comp) {
        return '{ "success": false, "error": "Composition not found", "code": "TARGET_NOT_FOUND" }';
      }

      app.beginUndoGroup("Rezel: Add To Render Queue");
      var item = app.project.renderQueue.items.add(comp);
      app.endUndoGroup();

      var queueIndex = app.project.renderQueue.numItems;
      var outPath = null;
      if (item.numOutputModules > 0 && item.outputModule(1).file) {
        outPath = item.outputModule(1).file.fsName || item.outputModule(1).file.fullName || null;
      }

      return '{ "success": true, ' +
             '"queueIndex": ' + queueIndex + ', ' +
             '"compositionId": ' + escapeJSON(String(comp.id)) + ', ' +
             '"compositionName": ' + escapeJSON(comp.name) + ', ' +
             '"status": ' + escapeJSON(mapRQStatus(item.status)) + ', ' +
             '"outputFilePath": ' + (outPath ? escapeJSON(outPath) : 'null') + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function setRenderOutputPath(queueIndex, outputFilePath, expectedCompId) {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No active project", "code": "PROJECT_NOT_OPEN" }';
      }

      var idx = Number(queueIndex);
      var rq = app.project.renderQueue;
      if (isNaN(idx) || idx < 1 || idx > rq.numItems) {
        return '{ "success": false, "error": "Render queue item not found at index " + queueIndex, "code": "TARGET_NOT_FOUND" }';
      }

      var item = rq.item(idx);
      if (!item) {
        return '{ "success": false, "error": "Render queue item not found", "code": "TARGET_NOT_FOUND" }';
      }

      // Check composition identity if provided to guard against transient index shifting
      if (expectedCompId !== null && expectedCompId !== undefined && expectedCompId !== "null" && expectedCompId !== "") {
        if (!item.comp || String(item.comp.id) !== String(expectedCompId)) {
          return '{ "success": false, "error": "Render queue item identity mismatch (stale index)", "code": "TARGET_STALE" }';
        }
      }

      if (item.numOutputModules < 1) {
        return '{ "success": false, "error": "No output module found on render queue item", "code": "NO_OUTPUT_MODULE" }';
      }

      var targetFile = new File(outputFilePath);
      app.beginUndoGroup("Rezel: Set Render Output Path");
      item.outputModule(1).file = targetFile;
      app.endUndoGroup();

      var resultingPath = item.outputModule(1).file ? (item.outputModule(1).file.fsName || item.outputModule(1).file.fullName) : outputFilePath;
      return '{ "success": true, ' +
             '"queueIndex": ' + idx + ', ' +
             '"outputFilePath": ' + escapeJSON(resultingPath) + ', ' +
             '"compositionId": ' + (item.comp ? escapeJSON(String(item.comp.id)) : 'null') + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function startRender() {
    try {
      if (!app.project) {
        return '{ "success": false, "error": "No active project", "code": "PROJECT_NOT_OPEN" }';
      }

      var rq = app.project.renderQueue;
      if (!rq || rq.numItems === 0) {
        return '{ "success": false, "error": "Render queue is empty", "code": "NO_QUEUED_ITEMS" }';
      }

      // Ensure at least one item is QUEUED
      var hasQueued = false;
      for (var i = 1; i <= rq.numItems; i++) {
        var it = rq.item(i);
        if (it && (it.render === true || (typeof RQItemStatus !== 'undefined' && it.status === RQItemStatus.QUEUED))) {
          hasQueued = true;
          break;
        }
      }

      if (!hasQueued) {
        return '{ "success": false, "error": "No queued items found to render", "code": "NO_QUEUED_ITEMS" }';
      }

      // Synchronous blocking render call
      rq.render();

      // Post-render inspection
      var completedItems = 0;
      var failedItems = 0;
      var itemsSummary = [];
      for (var j = 1; j <= rq.numItems; j++) {
        var rItem = rq.item(j);
        if (!rItem) continue;
        var rStatus = mapRQStatus(rItem.status);
        if (rStatus === "DONE") completedItems++;
        if (rStatus === "ERR_STOPPED" || rStatus === "USER_STOPPED") failedItems++;

        var outPath = null;
        if (rItem.numOutputModules > 0 && rItem.outputModule(1).file) {
          outPath = rItem.outputModule(1).file.fsName || rItem.outputModule(1).file.fullName;
        }
        itemsSummary.push('{ "index": ' + j + ', "status": ' + escapeJSON(rStatus) + ', "outputFilePath": ' + (outPath ? escapeJSON(outPath) : 'null') + ' }');
      }

      return '{ "success": true, ' +
             '"numItems": ' + rq.numItems + ', ' +
             '"completedItems": ' + completedItems + ', ' +
             '"failedItems": ' + failedItems + ', ' +
             '"items": [' + itemsSummary.join(', ') + '] }';
    } catch (e) {
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  function importFile(filePath, compId) {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return '{ "success": false, "error": "Invalid file path provided", "code": "INVALID_PATH" }';
      }

      // Check path traversal & control characters
      if (filePath.indexOf('..') !== -1 || /[\x00-\x1f]/.test(filePath)) {
        return '{ "success": false, "error": "Path traversal or control characters detected in file path", "code": "SECURITY_VIOLATION" }';
      }

      var targetFile = new File(filePath);
      if (!targetFile.exists) {
        return '{ "success": false, "error": "File does not exist at path: " + escapeJSON(filePath), "code": "FILE_NOT_FOUND" }';
      }

      if (!app.project) {
        app.newProject();
      }

      app.beginUndoGroup("Rezel: Import File");
      
      var importOptions = new ImportOptions(targetFile);
      var importedItem = app.project.importFile(importOptions);
      
      var layerIndex = null;
      if (compId !== null && compId !== undefined && compId !== "null" && compId !== "") {
        var comp = getCompById(Number(compId));
        if (comp && importedItem) {
          var layer = comp.layers.add(importedItem);
          layerIndex = layer.index;
        }
      }
      
      app.endUndoGroup();

      if (!importedItem) {
        return '{ "success": false, "error": "Import failed: item was not created", "code": "IMPORT_FAILED" }';
      }

      return '{ "success": true, ' +
             '"itemId": ' + importedItem.id + ', ' +
             '"name": ' + escapeJSON(importedItem.name) + ', ' +
             '"typeName": ' + escapeJSON(importedItem.typeName || "Footage") + ', ' +
             '"layerIndex": ' + (layerIndex !== null ? layerIndex : 'null') + ', ' +
             '"filePath": ' + escapeJSON(targetFile.fsName || targetFile.fullName) + ' }';
    } catch (e) {
      if (app.project) app.endUndoGroup();
      return '{ "success": false, "error": ' + escapeJSON(e.toString()) + ' }';
    }
  }

  return {
    getStatus: getStatus,
    createComp: createComp,
    addTextLayer: addTextLayer,
    createProject: createProject,
    setTransform: setTransform,
    saveProject: saveProject,
    inspectProject: inspectProject,
    inspectTimeline: inspectTimeline,
    addKeyframe: addKeyframe,
    setKeyframeValue: setKeyframeValue,
    inspectEffects: inspectEffects,
    setPropertyValue: setPropertyValue,
    inspectRenderQueue: inspectRenderQueue,
    addToRenderQueue: addToRenderQueue,
    setRenderOutputPath: setRenderOutputPath,
    startRender: startRender,
    importFile: importFile
  };
})();
