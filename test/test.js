import Wherewolf from "../wherewolf";
import * as fs from "fs";
import * as path from "path";
import * as assert from "assert";

let ww;
let point = [-74.005363,40.726760]; //wnyc office

// check topojson add
fs.readFile(path.join(__dirname,"../examples/nyc/districts.json"), "utf8", function(err, data) {
  data = JSON.parse(data);

  ww = new Wherewolf({index: false});
  ww.addAll(data);

  assert.deepEqual(ww.layerNames().length, 9, ["wrong number of layers"]);
  assert.deepEqual(ww.remove("Police Precinct (NYC)").layerNames().length, 8, ["remove error"]);
  assert.deepEqual(ww.find({lat:point[1], lng:point[0]})["Borough (NYC)"].name,"Manhattan", ["find dict point error"]);
  assert.deepEqual(ww.find(point)["Borough (NYC)"].name,"Manhattan", ["find array point error"]);

  //find options
  assert.deepEqual(ww.find(point,{layer: "Borough (NYC)"}).name,"Manhattan", ["layer option search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true})["Neighborhood (NYC)"].type, "Feature", ["whole feature search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true, layer: "Borough (NYC)"}).type, "Feature", ["whole feature + layer search error"]);

  // repeat with indexing enabled
  ww = new Wherewolf({index: true});
  ww.addAll(data);

  assert.deepEqual(ww.find({lat:point[1], lng:point[0]})["Borough (NYC)"].name,"Manhattan", ["find dict point error"]);
  assert.deepEqual(ww.find(point)["Borough (NYC)"].name,"Manhattan", ["find array point error"]);

  //find options
  assert.deepEqual(ww.find(point,{layer: "Borough (NYC)"}).name,"Manhattan", ["layer option search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true})["Neighborhood (NYC)"].type, "Feature", ["whole feature search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true, layer: "Borough (NYC)"}).type, "Feature", ["whole feature + layer search error"]);
});

// check geojson add
fs.readFile(path.join(__dirname,"carlsjr_hardees/carlsjr_hardees.json"), "utf8", function(err, data) {
  data = JSON.parse(data);

  ww = new Wherewolf();
  ww.add("carlsjr_hardees", data);

  assert.deepEqual(ww.layerNames().length, 1, ["wrong number of layers"]);
  assert.deepEqual(ww.remove("carlsjr_hardees").layerNames().length, 0, ["remove error"]);
  ww.add("carlsjr_hardees", data, "carlsjr_hardees");
  assert.deepEqual(ww.find({lat:point[1], lng:point[0]}).carlsjr_hardees.name,"neither", ["find dict point error"]);
  assert.deepEqual(ww.find(point).carlsjr_hardees.name,"neither", ["find array point error"]);

  //find options
  assert.deepEqual(ww.find(point,{layer: "carlsjr_hardees"}).name,"neither", ["layer option search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true}).carlsjr_hardees.type, "Feature", ["whole feature search error"]);
  assert.deepEqual(ww.find(point,{wholeFeature: true, layer: "carlsjr_hardees"}).type, "Feature", ["whole feature + layer search error"]);

});

// check point add
fs.readFile(path.join(__dirname,"point.geojson"), "utf8", function(err, data) {
  data = JSON.parse(data);
  ww = Wherewolf();

  let layerName = "wnycoffice";
  ww.add(layerName, data, layerName);

  assert.deepEqual(ww.layerNames().length, 1, ["wrong number of layers"]);
  assert.deepEqual(ww.remove(layerName).layerNames().length, 0, ["remove error"]);
  ww.add(layerName, data);

  assert.deepEqual(ww.find({lat: point[1], lng: point[0]})[layerName].name, "office", ["find dict point error"]);
  assert.deepEqual(ww.find(point)[layerName].name, "office", ["find array point error"]);

  //find options
  assert.deepEqual(ww.find(point, {layer: "wnycoffice"}).name, "office", ["layer option search error"]);
  assert.deepEqual(ww.find(point, {wholeFeature: true})[layerName].type, "Feature", ["whole feature search error"]);
  assert.deepEqual(ww.find(point, {wholeFeature: true, layer: layerName}).type, "Feature", ["whole feature + layer search error"]);
});
