/* jshint esversion: 6 */

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


class Circle {
  constructor(center, radius, clockwise) {
    this.center = center;
    this.radius = radius;
    this.clockwise = clockwise;
  }
  arcPoints(a, b) {
    var angleA = a.angle;
    var angleB = b.angle;
    if (this.clockwise && angleA > angleB) {
      angleB += Math.PI * 2;
    }
    if ( ! this.clockwise && angleA < angleB) {
      angleB -= Math.PI * 2;
    }
    var angle = angleB - angleA;
    var angle01 = Math.abs(angle) / (Math.PI * 2);
    var resolution = 5;
    var count = Math.floor(angle01 * resolution);
    count += 2;
    var points = [];
    for (var i = 0; i < count; i++) {
      points.push(
        new CirclePoint(a.circle, a.angle + (angle / (count - 1)) * i)
      );
    }
    return points;
  }
  homotheticCenters(b) {
    var a = this;
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
  tangentPoints(b) {
    var a = this;
    var centers = a.homotheticCenters(b);

    var angleInnerA = Math.acos(a.radius / a.center.distanceTo(centers.inner));
    var angleInnerB = Math.acos(b.radius / b.center.distanceTo(centers.inner));

    var angleOuterA = Math.acos(a.radius / a.center.distanceTo(centers.outer));
    var angleOuterB = Math.acos(b.radius / b.center.distanceTo(centers.outer));

    var v;

    v = centers.inner.clone().sub(a.center);
    var localInnerA = Math.atan2(v.x, v.y);
    v = centers.inner.clone().sub(b.center);
    var localInnerB = Math.atan2(v.x, v.y);

    v = centers.outer.clone().sub(a.center);
    var localOuterA = Math.atan2(v.x, v.y);
    v = centers.outer.clone().sub(b.center);
    var localOuterB = Math.atan2(v.x, v.y);

    var result = {
      inner: {
        anticlockwise: [
          new CirclePoint(a, mod(angleInnerA + localInnerA, Math.PI * 2)),
          new CirclePoint(b, mod(angleInnerB + localInnerB, Math.PI * 2))
        ],
        clockwise: [
          new CirclePoint(a, mod(-angleInnerA + localInnerA, Math.PI * 2)),
          new CirclePoint(b, mod(-angleInnerB + localInnerB, Math.PI * 2))
        ]
      },
      outer: {
        clockwise: [
          new CirclePoint(a, mod(angleOuterA + localOuterA, Math.PI * 2)),
          new CirclePoint(b, mod(angleOuterB + localOuterB, Math.PI * 2)),
        ],
        anticlockwise: [
          new CirclePoint(a, mod(-angleOuterA + localOuterA, Math.PI * 2)),
          new CirclePoint(b, mod(-angleOuterB + localOuterB, Math.PI * 2)),
        ]
      }
    };

    if (a.radius > b.radius) {
      result = {
        inner: result.inner,
        outer: {
          clockwise: result.outer.anticlockwise,
          anticlockwise: result.outer.clockwise
        }
      };
    }

    //TODO equal radius

    return result;
  }
}


class Anchor {
  constructor(position, handle) {
    this.position = position;
    this.handle = handle;
  }
  invert() {
    this.handle.multiplyScalar(-1);
  }
}

class CirclePoint {
  constructor(circle, angle) {
    this.circle = circle;
    this.angle = angle;
  }
  toAnchor() {
    var position = new THREE.Vector2(
      Math.sin(this.angle) * this.circle.radius,
      Math.cos(this.angle) * this.circle.radius
    );
    var perpendicular = new THREE.Vector2(
      position.y * -1,
      position.x
    ).normalize();
    position.add(this.circle.center);
    return new Anchor(position, perpendicular);
  }
}



var circles = [];

for (var i = 0; i < 5; i++) {
  circles.push(new Circle(
    new THREE.Vector2(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ),
    Math.random() * 0.2 + 0.1,
    i % 2 === 0
  ));
}

circles = [{
  "center":{
    "x":0.51270949530450052,
    "y":0.29910675035724388
  },
  "radius":0.0944216402148418,
  "clockwise": false
},{
  "center":{
    "x":0.01497879920403404,
    "y":0.28396038534998764
  },
  "radius":0.20537279631523161,
  "clockwise": false
},{
  "center":{
    "x":0.1078719574635445,
    "y":-0.3133695586361175
  },
  "radius":0.31306736207046515,
  "clockwise": false
},{
  "center":{
    "x":0.5378719574635445,
    "y":-0.3133695586361175
  },
  "radius":0.3130673620704651,
  "clockwise": true
},{
  "center":{
    "x":-0.9378719574635445,
    "y":-0.5133695586361175
  },
  "radius":0.21306736207046515,
  "clockwise": false
}];

// circles = circles.slice(2, 4);

// circles[1].center.y = 0;
// circles[2].center.x = -.88;

circles = circles.map(function(circle) {
  return new Circle(
    new THREE.Vector2(circle.center.x, circle.center.y),
    circle.radius,
    circle.clockwise
  );
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

  var debugPositions = [];


  var circle1;
  var circle2;
  var tangentAnchors;
  var startPoint = new THREE.Vector2(0, .5);
  var tangents;

  circles.forEach(function(circle, i) {

    circle1 = circles[i + 1];
    circle2 = circles[i + 2];
    if ( ! circle1) {
      return;
    }

    var side = 'outer';

    tangents = circle.tangentPoints(circle1);
    // debugTangent(debugPositions, tangentsStart.inner.clockwise, false);
    // debugTangent(debugPositions, tangentsStart.outer.clockwise, true);
    var circlePointsStartA = circle.clockwise ? tangents[side].clockwise[0] : tangents[side].anticlockwise[0];
    var circlePointsStartB = circle1.clockwise ? tangents[side].clockwise[1] : tangents[side].anticlockwise[1];

    var kink = Math.abs(diffAngles(
      tangents.outer.anticlockwise[0].angle,
      tangents.inner.anticlockwise[0].angle
    ));
    if (isNaN(kink)) {
      kink = 100;
    }
    var kinkWeight = rangec(0.9, 1.4, kink);

    var a1s = circlePointsStartA.toAnchor();
    var a2s = circlePointsStartB.toAnchor();

    var dist = a1s.position.distanceTo(a2s.position);
    var r0 = circle.radius / (circle.radius + circle1.radius);
    var r1 = circle1.radius / (circle.radius + circle1.radius);

    var invert = ! circle.clockwise ? 1 : -1;

    var r0far  = r0 * dist * invert * .5;
    var r1far  = r1 * dist * invert * .5;
    var r0near  = dist * invert * .5;
    var r1near  = dist * invert * .5;
    
    r0 = lerp(r0far, r0near, kinkWeight);
    r1 = lerp(r1far, r1near, kinkWeight);
    a1s.handle.multiplyScalar(r0);
    a2s.handle.multiplyScalar(r1);

    curve.add(createBezier(a1s, a2s));

    if ( ! circle2) {
      return;
    }

    tangents = circle1.tangentPoints(circle2);
    var circlePointEnd = circle1.clockwise ? tangents[side].clockwise[0] : tangents[side].anticlockwise[0];

    var arcPoints = circle1.arcPoints(circlePointsStartB, circlePointEnd);
    arcPoints.forEach(function(arcPoint1, k) {
      var arcPoint2 = arcPoints[k + 1];
      if ( ! arcPoint2) {
        return;
      }
      var size = Math.abs(arcPoint1.angle - arcPoint2.angle) * arcPoint1.circle.radius / 3;
      var apa1 = arcPoint1.toAnchor();
      var apa2 = arcPoint2.toAnchor();
      apa1.handle.multiplyScalar(size);
      apa2.handle.multiplyScalar(size);
      if (circle1.clockwise) {
        apa1.invert();
      } else {
        apa2.invert();
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


function debugTangent(debugPositions, tangent, clockwise) {
  var anchorA = circlePointToAnchor(tangent[0]);
  var anchorB = circlePointToAnchor(tangent[1]);
  var width = .1;
  var color = clockwise ? 0 : .5;
  debugPositions.push([
    anchorA.position.x,
    anchorA.position.y,
    color - .2
  ]);
  debugPositions.push([
    anchorB.position.x,
    anchorB.position.y,
    color - .2
  ]);
  debugPositions.push([
    anchorB.position.x + anchorB.handle.y * width,
    anchorB.position.y - anchorB.handle.x * width,
    color - .2
  ]);
  debugPositions.push([
    anchorB.position.x + anchorB.handle.y * width,
    anchorB.position.y - anchorB.handle.x * width,
    color
  ]);
  debugPositions.push([
    anchorA.position.x,
    anchorA.position.y,
    color
  ]);
  debugPositions.push([
    anchorA.position.x + anchorA.handle.y * width,
    anchorA.position.y - anchorA.handle.x * width,
    color
  ]);
}

function diffAngles(a, b) {
  return mod(a - b + Math.PI, Math.PI * 2) - Math.PI;
}

function mod(a, n) {
  return a - Math.floor(a / n) * n;
}

function rangec(min, max, value) {
  return clamp(range(min, max, value), 0, 1);
}

function range(min, max, value) {
  return (value - min) / (max - min);
}

function clamp(value, min, max) {
  return Math.max(Math.min(value, max), min);
}

function lerp(v0, v1, t) {
    return v0 * (1 - t) + v1 * t;
}

function createBezier(anchorA, anchorB) {
  return new THREE.CubicBezierCurve(
    anchorA.position,
    anchorA.position.clone().add(anchorA.handle),
    anchorB.position.clone().add(anchorB.handle),
    anchorB.position
  );
}
