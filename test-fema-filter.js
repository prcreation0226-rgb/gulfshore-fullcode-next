const fs = require('fs');

async function testFema() {
  const bbox = "-9073163.504996328,3014167.0427187425,-9070717.518652683,3016613.029062388";
  
  // Test 1: Just layer 28
  const url1 = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=${bbox}&bboxSR=3857&layers=show:28&size=512,512&imageSR=3857&format=png32&transparent=true&f=image`;
  
  // Test 2: Layer 28 with layerDefs filtering out X
  const layerDefs = encodeURIComponent('{"28":"FLD_ZONE<>\'X\'"}');
  const url2 = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=${bbox}&bboxSR=3857&layers=show:28&layerDefs=${layerDefs}&size=512,512&imageSR=3857&format=png32&transparent=true&f=image`;

  // Test 3: SFHA only
  const sfhaDefs = encodeURIComponent('{"28":"SFHA_TF=\'T\'"}');
  const url3 = `https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer/export?bbox=${bbox}&bboxSR=3857&layers=show:28&layerDefs=${sfhaDefs}&size=512,512&imageSR=3857&format=png32&transparent=true&f=image`;

  console.log("URL1 (No filter):", url1);
  console.log("URL2 (No X):", url2);
  console.log("URL3 (SFHA only):", url3);
}

testFema().catch(console.error);
