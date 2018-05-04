var regl = createREGL({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});

var points = 50;
var verts = [];
for (var i = 0; i < points * 2; i++) {
    verts.push([i, i]);
}

var texturePoints = 50;
var textureConf = {
  width: texturePoints,
  height: 1,
  channels: 2,
  mag: 'linear',
  type: 'float'
};
var bezierTexture = regl.texture(textureConf);

var draw = regl({
  primitive: 'lines',
  frag: `
  precision mediump float;
  uniform vec4 color;
  varying float t;
  varying float v;
  void main () {
    float on = mod(v, 2.);
    on = 0.;
    gl_FragColor = vec4(vec3(on),1);
  }`,

  vert: `
  precision mediump float;
  attribute vec2 position;
  uniform float points;
  uniform float viewWidth;
  uniform float viewHeight;
  uniform sampler2D bezierLUT;
  varying float t;
  varying float v;
  float PI = 3.14159265359;
  void main () {
    float vertIndex = position.x;
    v = floor(vertIndex * .5 + .5);
    t = v / points;
    vec2 pos;
    pos = texture2D(bezierLUT, vec2(t, 0)).xw / 255.;
    // convert range(0, 1) to range(-1, 1)
    pos = pos * 2. - 1.;
    //pos = vec2(sin(t * PI * 2.) * .5, cos(t * PI * 2.) * .5);
    if (viewHeight < viewWidth) {
      pos.x *= viewHeight / viewWidth;
    } else {
      pos.y *= viewWidth / viewHeight;
    }
    gl_Position = vec4(pos, 0, 1);
  }`,

  attributes: {
    position: verts
  },

  uniforms: {
    color: [1, 1, 1, 1],
    points: points,
    viewWidth: regl.context('drawingBufferWidth'),
    viewHeight: regl.context('drawingBufferHeight'),
    bezierLUT: bezierTexture
  },

  count: verts.length
})

var tick = regl.frame(function(context) {
  regl.clear({
    color: [1, 1, 1, 1],
    depth: 1
  })
  
  var curve = new THREE.CurvePath();  

  var part;
  
  var sz = 10;
  var width = 1 / sz;

  var xOffset = (context.time * .3) % 1;
  var start = Math.floor(xOffset * sz) * -1;
  start -= 1;
  var end = start + sz + 1;
  var invert = 1 - Math.abs(start % 2) * 2;

  // Need to slice the first curve

  for (var i = start; i < end; i++) {
    var x = i / sz;
    x += xOffset;
    invert *= -1;
    var offset = x;
    var heightA = x * .3;
    var heightB = (x + width) * .3;
    if (i == start) {
      heightA = 0;
      var wwidth = width + offset;
      offset = 0;
    } else {
      var wwidth = width;
    }
    curve.add(curvePart(
      offset,
      width,
      heightA * invert,
      -heightB * invert
    ));
  }

  /*

    move along line with t
    when crossed, interpolate t
    convert t to u
  */

  var desiredLen = 1;
  var len = curve.getLength();
  var curvePoints = [];
  var divisions = texturePoints - 1;
  for ( var d = 0; d <= divisions; d ++ ) {
    curvePoints.push( curve.getPointAt( (d / divisions) * (desiredLen / len) ) );
  }

  //var curvePoints = curve.getSpacedPoints(texturePoints - 1);
  var curvePointsFormatted = curvePoints.reduce(function(acc, v) {
    return acc.concat((v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255);
  }, []);
   
  textureConf.data = curvePointsFormatted;
  bezierTexture(textureConf);

  draw();
});


function curvePart(
  offset,
  width,
  startY,
  endY
) {
  var start = new THREE.Vector2(offset, startY);
  var end = new THREE.Vector2(offset + width, endY);
  var handle = start.distanceTo(end) / 3;
  handle += (Math.abs(startY) + Math.abs(endY)) * .33;
  var startHandle = new THREE.Vector2(
    offset + handle,
    startY
  );
  var endHandle = new THREE.Vector2(
    offset + width - handle,
    endY
  );
  return new THREE.CubicBezierCurve(
    start,
    startHandle,
    endHandle,
    end
  );
}


/*

  cut curve at length

*/
