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
    c = mix(c, vec3(1), .5);
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


var debugPositions = [];


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


class CircleCurve {
  constructor(circles) {
    this.circles = circles || [];
  }
  curve() {
    var path = new THREE.CurvePath();
    this.curvesForCircles().forEach(function(curve) {
      path.add(curve);
    });
    return path;
  }
  circleForCurvePosition(position) {
    var curveLength = 0;
    var curvesForCircles = this.curvesForCircles();
    for (var i = 0; i < curvesForCircles.length; i++) {
      curveLength += curvesForCircles[i].getLength();
      // console.log(curveLength);
      if (curveLength > position) {
        return i;
      }
    }
    return i;
  }
  curvesForCircles() {
    var curves = [];
    var prevPrev, prev, current, next;
    for (var i = 0; i < this.circles.length; i++) {
      prevPrev = this.circles[i - 2];
      prev = this.circles[i - 1];
      current = this.circles[i];
      next = this.circles[i + 1];
      if (prev) {
        curves.push(this.createCurveForCircles(prevPrev, prev, current, next));
      }
    }
    return curves;
  }
  createCurveForCircles(prevPrev, prev, current, next) {
    var curve = new THREE.CurvePath();
    var anchors = this.findAnchors(prevPrev, prev, current, next);
    for (var i = 0; i < anchors.length; i++) {
      curve.add(this.createCurveFromAnchors(anchors[i][0], anchors[i][1]));
    }
    return curve;
  }
  findAnchors(prevPrev, prev, current, next) {
    var anchors = [];
    var joins = this.findJoins(prevPrev, prev, current, next);
    var joinA, joinB;
    for (var i = 0; i < joins.length; i++) {
      joinA = joins[i][0];
      joinB = joins[i][1];
      if (joinA.point.circle !== joinB.point.circle) {
        anchors.push(this.circleJoinAnchors(joinA, joinB));
      } else {
        anchors = anchors.concat(this.arcJoinAnchors(joinA, joinB));
      }
    }
    return anchors;
  }
  findJoins(prevPrev, prev, current, next) {

    var joins = [];
    var joinA, joinB;

    // join
    //   CirclePoint point
    //   CirclePoint idealPoint

    // create beziers between every pair of joins

    // get last join of previous circle

    var prevCurrentTangents = prev.tangentPoints(current);

    if (prevPrev) {
      var prevJoins = this.findJoins(null, prevPrev, prev, current);
      joinA = prevJoins[prevJoins.length - 1][1];
    } else if (prev.clockwise) {
      joinA = {
        point: prevCurrentTangents.outer.clockwise[0],
        idealPoint: prevCurrentTangents.inner.clockwise[0]
      };
    } else {
      joinA = {
        point: prevCurrentTangents.outer.anticlockwise[0],
        idealPoint: prevCurrentTangents.inner.anticlockwise[0]
      };
    }

    // Get joins(s) of current circle
  
    // if (next AND current prev/next tangents create a bad loop) {

    //   joins.push({
    //     point: equidistant point,
    //     idealPoint: innerTangentCurrentPrev
    //   })

    // } else {

    if (current.clockwise) {
      joinB = {
        point: prevCurrentTangents.outer.clockwise[1],
        idealPoint: prevCurrentTangents.inner.clockwise[1]
      };
    } else {
      joinB = {
        point: prevCurrentTangents.outer.anticlockwise[1],
        idealPoint: prevCurrentTangents.inner.anticlockwise[1]
      };
    }

    joins.push([joinA, joinB]);

    if (next) {
      var currentNextTangents = current.tangentPoints(next);

      joinA = joinB;

      if ( ! next.clockwise) {
        joinB = {
          point: currentNextTangents.outer.clockwise[0],
          idealPoint: currentNextTangents.inner.clockwise[0]
        };
      } else {
        joinB = {
          point: currentNextTangents.outer.anticlockwise[0],
          idealPoint: currentNextTangents.inner.anticlockwise[0]
        };
      }

      joins.push([joinA, joinB]);
    }

    return joins;
  }
  circleJoinAnchors(joinA, joinB) {
    var pointA = joinA.point;
    var pointB = joinB.point;
    if (pointA.circle == pointB.circle) {
      throw Error('Points must be on different circles');
    }

    var kink = Math.abs(diffAngles(
      joinA.point.angle,
      joinA.idealPoint.angle
    ));
    if (isNaN(kink)) {
      kink = 100;
    }
    var kinkWeight = rangec(0.9, 1.4, kink);

    var circleA = pointA.circle;
    var circleB = pointB.circle;

    var anchorA = pointA.toAnchor();
    var anchorB = pointB.toAnchor();

    var dist = anchorA.position.distanceTo(anchorB.position);
    var r0 = circleA.radius / (circleA.radius + circleB.radius);
    var r1 = circleB.radius / (circleA.radius + circleB.radius);

    var invertA = ! circleA.clockwise ? 1 : -1;
    var invertB = ! circleB.clockwise ? -1 : 1;

    var r0far  = r0 * dist * invertA * .5;
    var r1far  = r1 * dist * invertB * .5;
    var r0near  = dist * invertA * .5;
    var r1near  = dist * invertB * .5;
    
    r0 = lerp(r0far, r0near, kinkWeight);
    r1 = lerp(r1far, r1near, kinkWeight);

    anchorA.handle.multiplyScalar(r0);
    anchorB.handle.multiplyScalar(r1);

    // debugAnchors(anchorA, anchorB, false, this.circles.indexOf(circleA) / this.circles.length);

    return [anchorA, anchorB];
  }
  arcJoinAnchors(joinA, joinB) {
    var pointA = joinA.point;
    var pointB = joinB.point;
    if (pointA.circle !== pointB.circle) {
      throw Error('Points must be on the same circle');
    }
    var circle = pointA.circle;
    var arcPoints = circle.arcPoints(pointA, pointB);
    var anchors = [];
    arcPoints.forEach(function(arcPoint1, k) {
      var arcPoint2 = arcPoints[k + 1];
      if ( ! arcPoint2) {
        return;
      }
      var size = Math.abs(arcPoint1.angle - arcPoint2.angle) * circle.radius / 3;
      var anchorA = arcPoint1.toAnchor();
      var anchorB = arcPoint2.toAnchor();
      anchorA.handle.multiplyScalar(size);
      anchorB.handle.multiplyScalar(size);
      if (circle.clockwise) {
        anchorA.invert();
      } else {
        anchorB.invert();
      }
      anchors.push([anchorA, anchorB]);
    }.bind(this));
    return anchors;
  }
  createCurveFromAnchors(anchorA, anchorB) {
    return new THREE.CubicBezierCurve(
      anchorA.position,
      anchorA.position.clone().add(anchorA.handle),
      anchorB.position.clone().add(anchorB.handle),
      anchorB.position
    );
  }
}

var seed = Math.random();
console.log(seed);
Math.seedrandom(0.5490353568839184);

var snakeLength = 1;
var snakeHead = snakeLength;

var circleCurve = new CircleCurve();
while ((circleCurve.curve().getLength() || 0) < snakeLength) {
  circleCurve.circles.push(
    randomCircle(
      circleCurve.circles[circleCurve.circles.length - 1]
    )
  );
}

var specs = [
  -1, .03,
  .1, .04,
  .1, .08,
  .1, .09,
  .4, .1,
  .4, .15
];


// specs = [];
// var numSpecs = 4;
// var gap = .4;
// var size = .02;
// var sizeInc = .1;
// for (var i = 0; i < numSpecs * 2 - 1; i++) {
//   if (i == 0) {
//     specs.push(-1);
//   } else {
//     specs.push(gap);
//   }
//   specs.push(size);
//   if (i >= numSpecs - 1) {
//     size -= sizeInc;
//   } else {
//     size += sizeInc;
//   }
// }


circleCurve.circles = [];
var pos = 0;
specs.forEach(function(size, i) {
  if (i % 2 == 0) {
    pos += size;
  } else {
    pos += size;
    circleCurve.circles.push(
      new Circle(
        new THREE.Vector2(pos, 0),
        size,
        Math.floor(i / 2) % 2 == 0
      )
    );
    pos += size;
  }
});

snakeLength = circleCurve.curve().getLength();
snakeHead = snakeLength;


var delta = 0;
var lastTime = 0;

// var tick = regl.frame(tickDraw);

tickDraw({time: 0});

function tickDraw(context) {  
  delta = context.time - lastTime;
  lastTime = context.time;

  snakeHead += delta * 6;

  // Add circles until we have enough curve to move into
  while (snakeHead > circleCurve.curve().getLength()) {
    circleCurve.circles.push(
      randomCircle(
        circleCurve.circles[circleCurve.circles.length - 1]
      )
    );
  }

  // // Remove unused circles
  var snakeTail = snakeHead - snakeLength;
  var removeIndex = circleCurve.circleForCurvePosition(snakeTail);
  // console.log('circles', circleCurve.circles.length);
  // console.log('removeIndex', removeIndex);
  var before = circleCurve.curve().getLength();
  // console.log('curve length before', after);
  circleCurve.circles = circleCurve.circles.slice(removeIndex);
  var after = circleCurve.curve().getLength();
  // console.log('circles now', after);
  snakeHead -= before - after;
  snakeTail = snakeHead - snakeLength;

  regl.clear({
    color: [1, 1, 1, 1],
    depth: 1
  });

  // circles[0].center = new THREE.Vector2(
  //   Math.sin(context.time),
  //   Math.cos(context.time)
  // );

// for circle in circles
//   nextCircle = circles[i + 1]
//   anchorA, anchorB = tangent(circle, nextCircle)
//   if ! lastAnchor
//     lastAnchor = Anchor startPoint -anchorA.handle
//   bezier lastAnchor anchorA
//   bezier anchorA anchorB
//   lastAnchor anchorB

  /*
  var desiredLen = 5;
  var len = curve.getLength();
  var curvePoints = [];
  var divisions = texturePoints - 1;
  for ( var d = 0; d <= divisions; d ++ ) {
    curvePoints.push( curve.getPointAt( (d / divisions) * (desiredLen / len) ) );
  }
  */

  var curve = circleCurve.curve();
  // console.log('curve length', curve.getLength());
  // console.log('head', snakeHead);
  // console.log('tail', snakeTail);
  var curvePoints = spacedPointsBetween(curve, snakeHead, snakeTail, texturePoints);
  // var curvesForCircles = circleCurve.curvesForCircles();
  // curvePoints = curvesForCircles[0].getSpacedPoints(texturePoints - 1);
  // curvePoints = curvesForCircles[curvesForCircles.length - 1].getSpacedPoints(texturePoints - 1);
  // curvePoints = curve.getSpacedPoints(texturePoints - 1);
  // var curvePoints = curve.getSpacedPoints(texturePoints - 1);
  var curvePointsFormatted = curvePoints.reduce(function(acc, v) {
    return acc.concat((v.x * .5 + .5) * 255, (v.y * .5 + .5) * 255);
  }, []);

  textureConf.data = curvePointsFormatted;
  bezierTexture(textureConf);

  draw();

  var segments = 20;
  circleCurve.circles.forEach(function(circle, i) {
    var colIndex = i / circleCurve.circles.length;
    debugCircle(circle.center, circle.radius, colIndex);
  });

  drawOverlay(regl({
    attributes: {
      position: debugPositions
    },
    count: debugPositions.length
  }));

//   if (context.time > .1) {
//   debugger;
// } 
}

function debugCircle(center, radius, colIndex) {
  var segments = 20;
  for (var i = 0; i < segments; i++) {
    var j = (i + 1) % segments;
    debugPositions.push([
      center.x,
      center.y,
      colIndex
    ]);
    debugPositions.push([
      center.x + Math.sin((i / segments) * Math.PI * 2) * radius,
      center.y + Math.cos((i / segments) * Math.PI * 2) * radius,
      colIndex
    ]);
    debugPositions.push([
      center.x + Math.sin((j / segments) * Math.PI * 2) * radius,
      center.y + Math.cos((j / segments) * Math.PI * 2) * radius,
      colIndex
    ]);
  }
}

function debugAnchors(anchorA, anchorB, clockwise, colIndex) {
  var width = .1;
  var color = clockwise ? 0 : .5;

  debugCircle(anchorA.position.clone().add(anchorA.handle), .1, colIndex);
  debugCircle(anchorB.position.clone().add(anchorB.handle), .1, colIndex);

  return;
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

function randomCircle(lastCircle) {
  var circle = new Circle(
    new THREE.Vector2(
      Math.random() * 2 - 1,
      Math.random() * 2 - 1
    ),
    Math.random() * 0.4 + 0.1,
    Math.random() > 0.5
  );
  if ( ! lastCircle) {
    return circle;
  }
  var distance = circle.center.distanceTo(lastCircle.center);
  var diff = distance - circle.radius - lastCircle.radius;
  if (diff < 0) {
    var direction = circle.center.clone().sub(lastCircle.center);
    direction = direction.normalize();
    direction.multiplyScalar(-diff + Math.random() * .2);
    circle.center.add(direction);
  }
  return circle;
}

function spacedPointsBetween(curve, start, end, divisions) {
  var curveLength = curve.getLength();
  var uStart = start / curveLength;
  var uEnd = end / curveLength;
  var uLength = uEnd - uStart;
  var points = [];
  var u;
  for (var i = 0; i < divisions; i++) {
    u = uStart + uLength * (i / divisions);
    points.push(curve.getPointAt(u));
  }
  return points;
}