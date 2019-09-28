import * as topojson from 'topojson-client';
import RBush from 'rbush';

// Basic class
// Start with empty layers
export default function Wherewolf(options) {
  //Defaults
  options = options || {};

  this.layers = {};

  //Object for storing layer indices
  if (options.index) {
    this.indices = {};
  }

  return this;

};

// Add a layer
Wherewolf.prototype.add = function(name, collection, key) {
  let features;

  // if it has a 'type' property
  if (collection && collection.type) {
    // check for a FeatureCollection or Topology
    if (collection.type === "FeatureCollection") {
      // if it's a FeatureCollection, get features
      features = collection.features;
    }
    else if (collection.type === "Topology") {
      // if it's a Topology, convert to a FeatureCollection
      features = _convertTopo(collection, key);
    }
    else if (collection.type === "Feature") {
      // if it is just a single feature, use it
      features = [collection];
    }
  }
  else if (Array.isArray(collection) && collection[0].type === "Feature") {
    // if it's an array, check for an array of features
    features = collection;
  }

  // not valid input
  if (!features) {
    throw new TypeError("No valid GeoJSON or TopoJSON supplied.");
  }

  //Get bounding box for each feature
  //If bbox already exists, use that
  features = features.map(function(f){
    f.bbox = f.bbox || _getBBox(f);
    return f;
  });

  //Save features array as a layer
  this.layers[name] = features;

  //Add to index
  if (this.indices) {
    this.indices[name] = new RBush(16, ['.bbox[0][0]', '.bbox[0][1]', '.bbox[1][0]', '.bbox[1][1]']);
    this.indices[name].load(features);
  }

  return this;

};

// Add all objects from a Topology as layers
Wherewolf.prototype.addAll = function(topology) {
  // check for valid Topology
  if (topology.type && topology.type === "Topology" && topology.objects) {
    // for each object in it, add that layer. use the object key as the layer name.
    for (let key in topology.objects) {
      this.add(key, topology, key);
    }
  }
  else {
    throw new TypeError("No valid TopoJSON supplied.");
  }
  return this;
};

//Get a layer's features
Wherewolf.prototype.get = function(layerName) {
  if (layerName in this.layers) {
    return this.layers[layerName];
  }
  return null;
};

//Remove a layer by name
Wherewolf.prototype.remove = function(layerName) {
  if (layerName in this.layers) {
    delete this.layers[layerName];
  }
  if (this.indices && layerName in this.indices) {
    delete this.indices[layerName];
  }

  return this;
};

//Returns an array of current layer names
Wherewolf.prototype.layerNames = function() {
  return Object.keys(this.layers);
};

//Find a point, with options
//Possible options are:
//  'layer': get one specific layer name (default: all layers)
//  'wholeFeature': return the feature itself (default: just its properties)
Wherewolf.prototype.find = function(point, options) {
  let results;

  //Defaults
  options = options || {};

  // if supplied an object with lat and lng, that's OK
  // {lng: 45, lat: 46} is confverted to [45, 46]
  if (point && point.lat && point.lng) {
    point = [point.lng, point.lat];
  }

  // check for a valid point
  if (!Array.isArray(point) || point.length !== 2 || !_isNumber(point[0]) || !_isNumber(point[1])) {
    throw new TypeError("Invalid point.  Latitude/longitude required.");
  }

  if (options.layer) { // if query for a specific layer, just return a single result
    // has index?
    if (this.indices && options.layer in this.indices) {
      return _findLayer(point, _queryIndex(point, this.indices[options.layer]), options);
    }

    //FIX: pass all options
    if (options.layer in this.layers) {
      return _findLayer(point, this.layers[options.layer], options);
    }

    throw new Error("Layer '"+layerName+"' not found.");
  }
  else {
    // return an object with the result for each layer
    results = {};
    for (let key in this.layers) {
      if (this.indices && key in this.indices) {
        results[key] = _findLayer(point,_queryIndex(point,this.indices[key]),options);
      } else {
        results[key] = _findLayer(point,this.layers[key],options);
      }
    }
  }

  return results;
};

function _queryIndex(point,index) {
  //Use index to find short list
  return index.search({
    minX: point[0],
    minY: point[1],
    maxX: point[0],
    maxY: point[1]
  });
}

//FIX: wholeFeature as all options
//Find a point in a specific layer
function _findLayer(point,layer,options) {
  //Check each feature in the layer
  for (let i = 0, l = layer.length; i < l; i++) {
    //If the point is inside this feature,
    //return its properties or the feature itself
    if (_inside(point,layer[i])) {
      return !!options.wholeFeature ? layer[i] : layer[i].properties;
    }
  }

  //No match, return null
  return null;
}

//Check whether a point is inside a GeoJSON feature
function _inside(point,feature) {
    //If feature is invalid or the point is outside
    //the feature bbox, return false
    if (!feature.geometry || (feature.bbox && !_inBox(point,feature.bbox))) {
      return false;
    }

    //Is the point in a given ring
    let inRing = function(ring){
      return _pip(point,ring);
    };

    //If it's a point, return true if
    //given point is the same
    if (feature.geometry.type === "Point") {
      return point[0] == feature.geometry.coordinates[0] && point[1] == feature.geometry.coordinates[1];
    }

    //If it's a polygon, return true if
    //point is in the first ring AND not
    //in any other rings (holes)
    if (feature.geometry.type === "Polygon") {
      return inRing(feature.geometry.coordinates[0]) && !feature.geometry.coordinates.slice(1).some(inRing);
    }

    //Otherwise assume it's a MultiPolygon
    //Return true if it's in any of the
    //constituent polygons
    for (let i = 0, l = feature.geometry.coordinates.length; i < l; i++) {
      if (inRing(feature.geometry.coordinates[i][0]) && !feature.geometry.coordinates[i].slice(1).some(inRing)) {
        return true;
      }
    }

    return false;
}

//Convert a Topology object to a FeatureCollection
function _convertTopo(collection,key) {
  let converted,
      features;

  //If it has no objects, it's invalid
  if (!collection.objects) {
    throw new TypeError("Invalid TopoJSON.");
  }

  if (typeof key !== "string") { //if no key supplied...
    let keys = Object.keys(collection.objects);
    if (keys.length === 1) {  // if only one object, use that
      key = keys[0];
    }
    else if (keys.length > 1) { // if multiple objects, throw an error
      throw new Error("You supplied a topology with multiple objects: " + JSON.stringify(keys) + ". Specify an object to add, or use .addAll().");
    }
    else {
      throw new Error("No objects found in topology.");
    }
  }
  else if (!(key in collection.objects)) { // check that the key exists
    throw new Error("The key '" + key + "' was not found in your TopoJSON object.");
  }

  try {
    //Get the FeatureCollection from the object named 'key'
    converted = topojson.feature(collection,collection.objects[key]);
  } catch(e) {
    throw new TypeError("Invalid TopoJSON.");
  }

  //If it returns a single Feature, turn that into an array
  if (converted.type === "Feature") {
    features = [converted];
  }
  else {
    features = converted.features;
  }

  return features;
}

//Is a point in the box [[xmin,ymin],[xmax,ymax]]
//This gets goofy with features that cross the antimeridian (e.g. Alaska)
//TODO: Make this work for spherical math
function _inBox(point,box) {
  return box && point[0] >= box[0][0] && point[0] <= box[1][0] && point[1] >= box[0][1] && point[1] <= box[1][1];
}

//Get the bounding box [[xmin,ymin],[xmax,ymax]]
//of a GeoJSON Polygon or MultiPolygon
function _getBBox(feature) {
  //Not valid
  if (!feature.geometry) {
    return false;
  }

  //if it's a point, put in an array
  if (feature.geometry.type === "Point"){
    return [
      feature.geometry.coordinates,
      feature.geometry.coordinates
    ];
  }

  //Don't check inner rings
  let outer = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates[0]] : feature.geometry.coordinates.map(function(f){
    return f[0];
  });

  //For each point, extend bounds as needed
  let bounds = [[Infinity,Infinity],[-Infinity,-Infinity]];

  outer.forEach(function(polygon){
    polygon.forEach(function(point){
      bounds = [
        [
          Math.min(point[0],bounds[0][0]),
          Math.min(point[1],bounds[0][1])
        ],
        [
          Math.max(point[0],bounds[1][0]),
          Math.max(point[1],bounds[1][1])
        ]
      ];
    });
  });

  return bounds;
}

//Check whether a number is a number
function _isNumber(num){
  return typeof(num) === "number" && !isNaN(num);
}

//ray-casting algorithm based on
//http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
//implementation from substack's point-in-polygon module
//https://www.npmjs.org/package/point-in-polygon
function _pip(point, vs) {
  let x = point[0],
      y = point[1],
      inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      let xi = vs[i][0], yi = vs[i][1];
      let xj = vs[j][0], yj = vs[j][1];

      let intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) {
        inside = !inside;
      }
  }

  return inside;
}


//JS implementation of the winding number algorithm
//Based on:
//http://www.engr.colostate.edu/~dga/dga/papers/point_in_polygon.pdf
//and Dan Sunday's C++ implementation:
//http://geomalgorithms.com/a03-_inclusion.html
function _winding(point,vs) {

  //Is a line from v1 to v2 entirely left of point p, entirely right of it, or neither?
  //A = difference in X from v1 to v2
  //B = difference in in Y from v1 to p
  //C = difference in X from v1 to p
  //D = difference in Y from v1 to v2
  //If AB > CD, it's strictly to the left of p in the direction v1->v2
  //If AB < CD, it's strictly to the right of p in the direction v1->v2
  function dir(v1,v2,p) {
    return (v2[0] - v1[0]) * (p[1] - v1[1]) - (p[0] -  v1[0]) * (v2[1] - v1[1])
  }

  function isLeft(v1,v2,p) {
      return dir(v1,v2,p) > 0;
  }

  function isRight(v1,v2,p) {
    return dir(v1,v2,p) < 0;
  }

  let w = 0;

  //Need to compare last point connecting back to first
  if (vs[vs.length-1][0] !== vs[0][0] || vs[vs.length-1][1] !== vs[0][1]) {
    vs = vs.slice(0);
    vs.push(vs[0]);
  }

  //For each segment
  for (let i = 0, l = vs.length - 1; i < l; i++) {
    //Check upward
    if (vs[i][1] <= point[1]) {
        if (vs[i+1][1] > point[1] && isLeft(vs[i],vs[i+1],point)) {
          w++;
        }
    // Check downward
    }
    else if (vs[i+1][1] <= point[1] && isRight(vs[i],vs[i+1],point)) {
        w--;
    }

  }

  return w !== 0;
}