var regl = createREGL({
  extensions: ['OES_texture_float', 'OES_texture_float_linear']
});

var points = 250;
var verts = [];
for (var i = 0; i < points * 2; i++) {
    verts.push([i, i]);
}

var texturePoints = 250;
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
  lineWidth: 3,
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
    vec2 mat;
    if (viewHeight < viewWidth) {
      mat = vec2(viewHeight / viewWidth, 1);
    } else {
      mat = vec2(1, viewWidth / viewHeight);
    }
    gl_Position = vec4(pos * mat, 0, 1);
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
});


var drawOverlay = regl({
  frag: `
  precision mediump float;

  varying float colIndex;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
      return a + b*cos( 6.28318*(c*t+d) );
  }

  vec3 spectrum(float n) {
      return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67) );
  }

  void main() {
    vec3 c = spectrum(colIndex);
    gl_FragColor = vec4(c, 1);
  }`,

  vert: `
  attribute vec3 position;
  uniform float viewWidth;
  uniform float viewHeight;
  varying float colIndex;
  void main() {
    vec2 mat;
    if (viewHeight < viewWidth) {
      mat = vec2(viewHeight / viewWidth, 1);
    } else {
      mat = vec2(1, viewWidth / viewHeight);
    }
    colIndex = position.z;
    gl_Position = vec4(position.xy * mat, 0, 1);
  }`,

  uniforms: {
    viewWidth: regl.context('drawingBufferWidth'),
    viewHeight: regl.context('drawingBufferHeight'),
  }
});


var circles = [];

for (var i = 0; i < 5; i++) {
  circles.push({
    center: new THREE.Vector2(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ),
    radius: Math.random() * 0.2 + 0.1
  });
}

circles = [{
  "center":{
    "x":0.16270949530450052,
    "y":0.17910675035724388
  },
  "radius":0.1244216402148418
},{
  "center":{
    "x":-0.31497879920403404,
    "y":0.48396038534998764
  },
  "radius":0.20537279631523161
},{
  "center":{
    "x":-0.2378719574635445,
    "y":-0.2133695586361175
  },
  "radius":0.11306736207046515
},{
  "center":{
    "x":0.5378719574635445,
    "y":-0.3133695586361175
  },
  "radius":0.31306736207046515
},{
  "center":{
    "x":-0.9378719574635445,
    "y":-0.5133695586361175
  },
  "radius":0.21306736207046515
}];

// circles = circles.slice(0, 2);

// circles[1].center.y = 0;
// circles[2].center.x = -.88;

circles.map(function(circle) {
  circle.center = new THREE.Vector2(circle.center.x, circle.center.y);
  return circle;
});

// var tick = regl.frame(function(context) {
  regl.clear({
    color: [1, 1, 1, 1],
    depth: 1
  });

  // circles[0].center = new THREE.Vector2(
  //   Math.sin(context.time),
  //   Math.cos(context.time)
  // );
  
  var curve = new THREE.CurvePath();  

  var part;

// for circle in circles
//   nextCircle = circles[i + 1]
//   anchorA, anchorB = tangent(circle, nextCircle)
//   if ! lastAnchor
//     lastAnchor = Anchor startPoint -anchorA.handle
//   bezier lastAnchor anchorA
//   bezier anchorA anchorB
//   lastAnchor anchorB


  var circle1;
  var circle2;
  var tangentAnchors;
  var startPoint = new THREE.Vector2(0, .5);
  var clockwise;
  circles.forEach(function(circle, i) {
    clockwise = i % 2 === 0;
    circle1 = circles[i + 1];
    circle2 = circles[i + 2];
    if ( ! circle1) {
      return;
    }

    var invert = clockwise ? 1 : -1;

    var tangentsStart = findTangentCirclePoints(circle, circle1);
    var circlePointsStart;
    if (clockwise) {
      circlePointsStart = tangentsStart.innerClockwise;
      circlePointsStart = tangentsStart.outerClockwise;
    } else {
      circlePointsStart = tangentsStart.innerAnticlockwise;
      circlePointsStart = tangentsStart.outerAnticlockwise;
    }
    var a1s = circlePointToAnchor(circlePointsStart[0]);
    var a2s = circlePointToAnchor(circlePointsStart[1]);

    var dist = a1s.position.distanceTo(a2s.position);
    var r0 = circle.radius / (circle.radius + circle1.radius);
    var r1 = circle1.radius / (circle.radius + circle1.radius);
    a1s.handle.multiplyScalar(r0 * dist * invert * .5);
    a2s.handle.multiplyScalar(r1 * dist * invert * .5);

    curve.add(createBezier(a1s, a2s));

    if ( ! circle2) {
      return;
    }

    var tangentsEnd = findTangentCirclePoints(circle1, circle2);
    var circlePointsEnd;
    if ( ! clockwise) {
      circlePointsEnd = tangentsEnd.innerClockwise;
      circlePointsEnd = tangentsEnd.outerClockwise;
    } else {
      circlePointsEnd = tangentsEnd.innerAnticlockwise;
      circlePointsEnd = tangentsEnd.outerAnticlockwise;
    }

    var arcPoints = findArcPoints(circlePointsStart[1], circlePointsEnd[0], clockwise);
    arcPoints.forEach(function(arcPoint1, k) {
      var arcPoint2 = arcPoints[k + 1];
      if ( ! arcPoint2) {
        return;
      }
      var size = Math.abs(arcPoint1.angle - arcPoint2.angle) * arcPoint1.circle.radius / 3;
      var apa1 = circlePointToAnchor(arcPoint1);
      var apa2 = circlePointToAnchor(arcPoint2);
      apa1.handle.multiplyScalar(size);
      apa2.handle.multiplyScalar(size);
      if (clockwise) {
        apa1 = invertHandle(apa1);
      } else {
        apa2 = invertHandle(apa2);
      }
      curve.add(createBezier(apa1, apa2));
    });

    // var a1e = circlePointToAnchor(circlePointsEnd[0]);
    // a1e.handle.multiplyScalar(circle1.radius * .5 * invert);

    // curve.add(createBezier(invertHandle(a2s), a1e));
  });

  /*

  three circles
  draw from first to next
  draw points until next tangent
  
  */

  // circles.forEach(function(circle) {
  //   addCircleToPath(curve, circle);
  // });

  /*
  var desiredLen = 5;
  var len = curve.getLength();
  var curvePoints = [];
  var divisions = texturePoints - 1;
  for ( var d = 0; d <= divisions; d ++ ) {
    curvePoints.push( curve.getPointAt( (d / divisions) * (desiredLen / len) ) );
  }
  */

  var curvePoints = curve.getSpacedPoints(texturePoints - 1);

  //var curvePoints = curve.getSpacedPoints(texturePoints - 1);
  var curvePointsFormatted = curvePoints.reduce(function(acc, v) {
    return acc.concat((v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255);
  }, []);

  textureConf.data = curvePointsFormatted;
  bezierTexture(textureConf);

  draw();

  var debugPositions = [];
  var segments = 20;
  circles.forEach(function(circle, i) {
    var colIndex = i / circles.length;
    for (var i = 0; i < segments; i++) {
      var j = (i + 1) % segments;
      debugPositions.push([
        circle.center.x,
        circle.center.y,
        colIndex
      ]);
      debugPositions.push([
        circle.center.x + Math.sin((i / segments) * Math.PI * 2) * circle.radius,
        circle.center.y + Math.cos((i / segments) * Math.PI * 2) * circle.radius,
        colIndex
      ]);
      debugPositions.push([
        circle.center.x + Math.sin((j / segments) * Math.PI * 2) * circle.radius,
        circle.center.y + Math.cos((j / segments) * Math.PI * 2) * circle.radius,
        colIndex
      ]);
    }
  });

  drawOverlay(regl({
    attributes: {
      position: debugPositions
    },
    count: debugPositions.length
  }));
// });


// a, b: circlePoint
function findArcPoints(a, b, clockwise) {
  var angleA = a.angle;
  var angleB = b.angle;
  if (clockwise && angleA > angleB) {
    angleB += Math.PI * 2;
  }
  if ( ! clockwise && angleA < angleB) {
    angleB -= Math.PI * 2;
  }
  var angle = angleB - angleA;
  var angle01 = Math.abs(angle) / (Math.PI * 2);
  var resolution = 5;
  var count = Math.floor(angle01 * resolution);
  count += 2;
  var points = [];
  for (var i = 0; i < count; i++) {
    points.push({
      circle: a.circle,
      angle: a.angle + (angle / (count - 1)) * i
    });
  }
  return points;
}

function mod(a, n) {
  return a - Math.floor(a / n) * n;
}

function circlePointToAnchor(point) {
  var position = new THREE.Vector2(
    Math.sin(point.angle) * point.circle.radius,
    Math.cos(point.angle) * point.circle.radius
  );
  var perpendicular = new THREE.Vector2(
    position.y * -1,
    position.x
  ).normalize();
  // perpendicular.multiplyScalar(0.01);
  position.add(point.circle.center);
  return {
    position: position,
    handle: perpendicular
  };
}

function invertHandle(anchor) {
  return {
    position: anchor.position,
    handle: anchor.handle.clone().multiplyScalar(-1)
  };
}

function findTangentCirclePoints(a, b) {
  var centers = findHmotheticCenters(a, b);

  var angleInnerA = Math.acos(a.radius / a.center.distanceTo(centers.inner));
  var angleInnerB = Math.acos(b.radius / b.center.distanceTo(centers.inner));

  var angleOuterA = Math.acos(a.radius / a.center.distanceTo(centers.outer));
  var angleOuterB = Math.acos(b.radius / b.center.distanceTo(centers.outer));

  var v;
  v = centers.inner.clone().sub(a.center);
  var localA = Math.atan2(v.x, v.y);
  v = centers.inner.clone().sub(b.center);
  var localB = Math.atan2(v.x, v.y);

  return {
    innerClockwise: [
      {
        angle: mod(angleInnerA + localA, Math.PI * 2),
        circle: a
      },
      {
        angle: mod(angleInnerB + localB, Math.PI * 2),
        circle: b
      }
    ],
    innerAnticlockwise: [
      {
        angle: mod(-angleInnerA + localA, Math.PI * 2),
        circle: a
      },
      {
        angle: mod(-angleInnerB + localB, Math.PI * 2),
        circle: b
      }
    ],
    outerClockwise: [
      {
        angle: mod(angleOuterA + localA, Math.PI * 2),
        circle: a
      },
      {
        angle: mod(angleOuterB + localB, Math.PI * 2),
        circle: b
      }
    ],
    outerAnticlockwise: [
      {
        angle: mod(-angleOuterA + localA, Math.PI * 2),
        circle: a
      },
      {
        angle: mod(-angleOuterB + localB, Math.PI * 2),
        circle: b
      }
    ]
  };
}

function findHmotheticCenters(a, b) {
  var inner = a.center.clone()
    .multiplyScalar(b.radius / (a.radius + b.radius))
    .add(
      b.center.clone()
        .multiplyScalar(a.radius / (a.radius + b.radius))
    );
  var outer = a.center.clone()
    .multiplyScalar(-b.radius / (a.radius - b.radius))
    .add(
      b.center.clone()
        .multiplyScalar(a.radius / (a.radius - b.radius))
    );
  return {inner: inner, outer: outer};
}

function createBezier(anchorA, anchorB) {
  return new THREE.CubicBezierCurve(
    anchorA.position,
    anchorA.position.clone().add(anchorA.handle),
    anchorB.position.clone().add(anchorB.handle),
    anchorB.position
  );
}

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

function addCircleToPath(curve, circle) {
  for (var i = 0; i < 4; i++) {
    var j = (i + 1) % 4;
    var a1 = (i / 4) * Math.PI * 2;
    var a2 = (j / 4) * Math.PI * 2;
    var h1 = ((i + 1) / 4) * Math.PI * 2;
    var h2 = ((j - 1) / 4) * Math.PI * 2;
    var anchorA = {
      position: new THREE.Vector2(
        circle.center.x + Math.sin(a1) * circle.radius,
        circle.center.y + Math.cos(a1) * circle.radius
      ),
      handle: new THREE.Vector2(
        Math.sin(h1) * circle.radius / 2,
        Math.cos(h1) * circle.radius / 2
      )
    };
    var anchorB = {
      position: new THREE.Vector2(
        circle.center.x + Math.sin(a2) * circle.radius,
        circle.center.y + Math.cos(a2) * circle.radius
      ),
      handle: new THREE.Vector2(
        Math.sin(h2) * circle.radius / 2,
        Math.cos(h2) * circle.radius / 2
      )
    };
    curve.add(createBezier(anchorA, anchorB));
  }
}

/*



Anchor
  Point
  Handle

for circle in circles
  nextCircle = circles[i + 1]
  anchorA, anchorB = tangent(circle, nextCircle)
  if ! lastAnchor
    lastAnchor = Anchor startPoint -anchorA.handle
  bezier lastAnchor anchorA
  bezier anchorA anchorB
  lastAnchor anchorB

*/
