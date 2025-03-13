/* - - MediaPipe Body tracking - - */

/*

Which tracking points can I use?
https://developers.google.com/static/mediapipe/images/solutions/pose_landmarks_index.png

We have a total of 33 points on the body:
(our points are mirrored, so left and right are switched)

0 = nose
12 = right shoulder
11 = left shoulder
26 = right knee
25 = left knee
32 = right foot
31 = left foot
20 = right hand
19 = left hand

Full documentation
https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/index

What we do in this example:
- lerp the landmarks to make them smoother
- based on https://github.com/amcc/easydetect by Alistair McClymont

*/


/* - - Variables - - */

// webcam variables
let capture; // our webcam
let captureEvent; // callback when webcam is ready

// lerping (i.e. smoothing the landmarks)
let lerpRate = 0.2; // smaller = smoother, but slower to react
let madeClone = false;
let lerpLandmarks;

// styling
let ellipseSize = 20; // size of the ellipses
let letterSize = 20; // size of the letter

// sound
let soundFile;

// Add these variables at the top with other variables
let mic;
let fft;
let audioLevel = 0;
let audioMultiplier = 5; // Increase from 2 to make audio input more sensitive
let micStarted = false;

// let parentDiv;

// Add these variables at the top
let prevPoints = {};
let velocities = {};

// Add at the top with other variables
let backgroundVideo;
let isVideoPlaying = false;  // Add this to track video state

// At the top with other variables
let isAudioStarted = false;  // Track audio state

// Add at the top with other variables
let centerGlow = {
  intensity: 0,
  targetIntensity: 0,
  x: 0,
  y: 0
};

// Add at the top with other variables
let handProximityGlow = {
  intensity: 0,
  targetIntensity: 0
};

// Add at the top with other variables
let floatingOrb = {
  x: 0,
  y: 0,
  angle: 0,
  radius: 200,
  baseRadius: 200,
  hue: 0
};

// Add at the top with other variables
let perlinGlow = {
  x: 0,
  y: 0,
  noiseOffsetX: 0,
  noiseOffsetY: 1000,
  speed: 0.001,
  size: 30,
  hue: 30,
  opacity: 1
};

// Add at the top with other variables
let bwBuffer;  // Buffer for black and white effect

function preload() {
  soundFile = loadSound('emergence2.mp3');
  // Add video preload
  backgroundVideo = createVideo('video.mov');
  backgroundVideo.hide();
  // Don't autoplay - wait for space bar
  backgroundVideo.pause();
}


/* - - Setup - - */
function setup() {
  createCanvas(windowWidth, windowHeight);
  captureWebcam();

  // Initialize audio input
  mic = new p5.AudioIn();
  
  // Don't auto-start mic
  fft = new p5.FFT();
  fft.setInput(mic);

  // styling
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(20);
  fill(255);

  // Create the black and white buffer
  bwBuffer = createGraphics(width, height);
}


/* - - Draw - - */
function draw() {
  // Update the video drawing section
  if (backgroundVideo) {
    let vidRatio = backgroundVideo.width / backgroundVideo.height;
    let w, h;
    
    // More extreme breathing and drifting
    let breathe = sin(frameCount * 0.001) * 0.3;
    let drift = {
      x: sin(frameCount * 0.0005) * 120 + cos(frameCount * 0.001) * 80,
      y: sin(frameCount * 0.001) * 100 + cos(frameCount * 0.0015) * 60
    };
    
    // More dramatic base scale changes with larger minimum size
    let baseScale = map(sin(frameCount * 0.0003), -1, 1, 0.7, 1.2);
    baseScale += breathe;
    
    // Make video scale based on sun's position with more dramatic effect
    let sunVerticalPos = map(perlinGlow.y, 0, height, 0, 1);
    let verticalScale = map(sunVerticalPos, 0, 1, 0.3, -0.3);
    
    let sunHorizontalPos = map(perlinGlow.x, 0, width, 0, 1);
    let horizontalScale = map(sunHorizontalPos, 0, 1, -0.3, 0.3);
    
    // Smooth scale transitions with larger range
    let targetScale = baseScale + verticalScale + horizontalScale;
    targetScale = constrain(targetScale, 0.7, 1.2);
    
    // Slower scale transitions for smoother changes
    if (!this.currentScale) this.currentScale = targetScale;
    this.currentScale = lerp(this.currentScale, targetScale, 0.001);
    
    // Apply the smoothed scale
    let targetWidth = width * this.currentScale;
    let targetHeight = height * this.currentScale;
    
    // Calculate dimensions maintaining aspect ratio
    if (targetWidth / targetHeight > vidRatio) {
      h = targetHeight;
      w = h * vidRatio;
    } else {
      w = targetWidth;
      h = w / vidRatio;
    }
    
    // Calculate sun's influence with more dramatic movement
    let sunAngle = atan2(perlinGlow.y - height/2, perlinGlow.x - width/2);
    let offsetMagnitude = map(dist(perlinGlow.x, perlinGlow.y, width/2, height/2), 0, width/2, 40, 120); // More movement range
    
    // Calculate video position with more dramatic drifting
    let videoX = (width - w)/2 - cos(sunAngle) * offsetMagnitude + drift.x;
    let videoY = (height - h)/2 - sin(sunAngle) * offsetMagnitude + drift.y;
    
    // Allow more overlap with window edges
    videoX = constrain(videoX, -w * 0.2, width - w * 0.8);
    videoY = constrain(videoY, -h * 0.2, height - h * 0.8);
    
    // Add stronger parallax effect
    videoX += (mouseX - width/2) * 0.04;
    videoY += (mouseY - height/2) * 0.04;
    
    // Final position constraints
    videoX = constrain(videoX, -w * 0.1, width - w * 0.9);
    videoY = constrain(videoY, -h * 0.1, height - h * 0.9);
    
    // Change background to absolute black
    background(0);
    
    push();
    translate(videoX + w/2, videoY + h/2);
    
    // Add subtle rotation based on drift
    let driftRotation = map(drift.x * drift.y, -10000, 10000, -PI/16, PI/16);
    rotate(driftRotation);
    
    // Update black and white buffer with darker tones
    bwBuffer.background(0);
    bwBuffer.image(backgroundVideo, 0, 0, w, h);
    bwBuffer.filter(GRAY);
    bwBuffer.filter(POSTERIZE, 6); // Add more contrast
    
    // Draw the black and white video
    image(bwBuffer, -w/2, -h/2, w, h);
    
    pop();
    
    // Add darker overlay
    push();
    let gradientCenter = {
      x: width/2 + cos(sunAngle + PI) * width/2,
      y: height/2 + sin(sunAngle + PI) * height/2
    };
    
    // Create darker radial gradient
    for (let i = 0; i < 5; i++) {
      let alpha = map(i, 0, 4, 70, 0); // Increased opacity
      fill(0, alpha * perlinGlow.opacity);
      let size = map(i, 0, 4, width * 2, 0);
      ellipse(gradientCenter.x, gradientCenter.y, size, size);
    }
    pop();
  } else {
    background(0); // Change fallback background to absolute black
  }

  /* TRACKING */
  if (mediaPipe.landmarks[0]) {
    // Remove these lines that show the webcam
    push();
    centerOurStuff();

    // clone the landmarks array for lerping
    if (!madeClone) {
      lerpLandmarks = JSON.parse(JSON.stringify(mediaPipe.landmarks));
      madeClone = true;
    }

    // lerp the landmarks
    for (let i = 0; i < mediaPipe.landmarks[0].length; i++) {
      lerpLandmarks[0][i].x = lerp(lerpLandmarks[0][i].x, mediaPipe.landmarks[0][i].x, lerpRate);
      lerpLandmarks[0][i].y = lerp(lerpLandmarks[0][i].y, mediaPipe.landmarks[0][i].y, lerpRate);
    }

    //console.log("we have a total of " + mediaPipe.landmarks[0].length + " points");

    // nose
    let noseX = map(lerpLandmarks[0][0].x, 1, 0, 0, capture.scaledWidth);
    let noseY = map(lerpLandmarks[0][0].y, 0, 1, 0, capture.scaledHeight);

    // left shoulder
    let leftShoulderX = map(lerpLandmarks[0][11].x, 1, 0, 0, capture.scaledWidth);
    let leftShoulderY = map(lerpLandmarks[0][11].y, 0, 1, 0, capture.scaledHeight);

    // right shoulder
    let rightShoulderX = map(lerpLandmarks[0][12].x, 1, 0, 0, capture.scaledWidth);
    let rightShoulderY = map(lerpLandmarks[0][12].y, 0, 1, 0, capture.scaledHeight);

    // left hand
    let leftHandX = map(lerpLandmarks[0][19].x, 1, 0, 0, capture.scaledWidth);
    let leftHandY = map(lerpLandmarks[0][19].y, 0, 1, 0, capture.scaledHeight);

    // right hand
    let rightHandX = map(lerpLandmarks[0][20].x, 1, 0, 0, capture.scaledWidth);
    let rightHandY = map(lerpLandmarks[0][20].y, 0, 1, 0, capture.scaledHeight);

    // left Elbow
    let leftElbowX = map(lerpLandmarks[0][13].x, 1, 0, 0, capture.scaledWidth);
    let leftElbowY = map(lerpLandmarks[0][13].y, 0, 1, 0, capture.scaledHeight);

    // right Elbow
    let rightElbowX = map(lerpLandmarks[0][14].x, 1, 0, 0, capture.scaledWidth);
    let rightElbowY = map(lerpLandmarks[0][14].y, 0, 1, 0, capture.scaledHeight);

    // right wrist
    let rightWristX = map(lerpLandmarks[0][16].x, 1, 0, 0, capture.scaledWidth);
    let rightWristY = map(lerpLandmarks[0][16].y, 0, 1, 0, capture.scaledHeight);

    // left wrist
    let leftWristX = map(lerpLandmarks[0][15].x, 1, 0, 0, capture.scaledWidth);
    let leftWristY = map(lerpLandmarks[0][15].y, 0, 1, 0, capture.scaledHeight);

    // right hip
    let hipX = map(lerpLandmarks[0][24].x, 1, 0, 0, capture.scaledWidth);
    let hipY = map(lerpLandmarks[0][24].y, 0, 1, 0, capture.scaledHeight);

    // left hip
    let hipX2 = map(lerpLandmarks[0][23].x, 1, 0, 0, capture.scaledWidth);
    let hipY2 = map(lerpLandmarks[0][23].y, 0, 1, 0, capture.scaledHeight);

    // right knee
    let kneeX = map(lerpLandmarks[0][26].x, 1, 0, 0, capture.scaledWidth);
    let kneeY = map(lerpLandmarks[0][26].y, 0, 1, 0, capture.scaledHeight);

    // left knee
    let kneeX2 = map(lerpLandmarks[0][25].x, 1, 0, 0, capture.scaledWidth);
    let kneeY2 = map(lerpLandmarks[0][25].y, 0, 1, 0, capture.scaledHeight);

    // right ankle
    let ankleX = map(lerpLandmarks[0][28].x, 1, 0, 0, capture.scaledWidth);
    let ankleY = map(lerpLandmarks[0][28].y, 0, 1, 0, capture.scaledHeight);

    // left ankle
    let ankleX2 = map(lerpLandmarks[0][27].x, 1, 0, 0, capture.scaledWidth);
    let ankleY2 = map(lerpLandmarks[0][27].y, 0, 1, 0, capture.scaledHeight);

    // right foot
    let rightFootX = map(lerpLandmarks[0][30].x, 1, 0, 0, capture.scaledWidth);
    let rightFootY = map(lerpLandmarks[0][30].y, 0, 1, 0, capture.scaledHeight);

    // left foot
    let leftFootX = map(lerpLandmarks[0][29].x, 1, 0, 0, capture.scaledWidth);
    let leftFootY = map(lerpLandmarks[0][29].y, 0, 1, 0, capture.scaledHeight);

    // right foot2
    let rightFoot2X = map(lerpLandmarks[0][32].x, 1, 0, 0, capture.scaledWidth);
    let rightFoot2Y = map(lerpLandmarks[0][32].y, 0, 1, 0, capture.scaledHeight);

    // left foot2
    let leftFoot2X = map(lerpLandmarks[0][31].x, 1, 0, 0, capture.scaledWidth);
    let leftFoot2Y = map(lerpLandmarks[0][31].y, 0, 1, 0, capture.scaledHeight);

    // Add this function before drawing the cilia
    function drawOrganicLine(startX, startY, endX, endY, color) {
      // Get current audio level with increased sensitivity
      audioLevel = micStarted ? mic.getLevel() * audioMultiplier : 0;
      
      let points = [];
      let segments = 15;
      let amplitude = 50 + (audioLevel * 200);  // Increase base amplitude and audio influence
      let timeOffset = frameCount * 0.01;
      
      // Generate control points for the organic line
      for (let i = 0; i <= segments; i++) {
        let t = i / segments;
        let x = lerp(startX, endX, t);
        let y = lerp(startY, endY, t);
        
        // Reduce wave speeds
        let wave = sin(t * PI * 2 + timeOffset * 0.5) * amplitude;
        let wave2 = cos(t * PI * 3 + timeOffset * 0.75) * amplitude * 0.5;
        
        x += wave;
        y += wave2;
        
        points.push({x, y});
      }
      
      // Draw the main flowing line with audio-reactive thickness
      noFill();
      strokeWeight(20 + (audioLevel * 60));     // More dramatic thickness change
      stroke(color.r, color.g, color.b, 40 + (audioLevel * 200));  // More dramatic opacity change
      beginShape();
      curveVertex(points[0].x, points[0].y);
      points.forEach(p => curveVertex(p.x, p.y));
      curveVertex(points[points.length-1].x, points[points.length-1].y);
      endShape();
      
      // Draw glowing core
      strokeWeight(12 + (audioLevel * 40));
      stroke(color.r, color.g, color.b, 80 + (audioLevel * 175));
      beginShape();
      curveVertex(points[0].x, points[0].y);
      points.forEach(p => curveVertex(p.x, p.y));
      curveVertex(points[points.length-1].x, points[points.length-1].y);
      endShape();
      
      // Draw particles along the line
      noStroke();
      for (let i = 1; i < points.length - 1; i++) {
        let p = points[i];
        let size = (10 + (audioLevel * 40)) * sin(i * 0.5 + timeOffset * 2);
        fill(color.r, color.g, color.b, 120 + (audioLevel * 135));
        ellipse(p.x, p.y, size, size);
      }
    }

    // Modify the getVelocity function to include acceleration
    function getVelocity(id, x, y) {
      if (!prevPoints[id]) {
        prevPoints[id] = {
          x: x, 
          y: y,
          vx: 0,
          vy: 0,
          lastVx: 0,
          lastVy: 0
        };
        velocities[id] = 0;
      }
      
      let dx = x - prevPoints[id].x;
      let dy = y - prevPoints[id].y;
      
      // Calculate velocity
      prevPoints[id].lastVx = prevPoints[id].vx;
      prevPoints[id].lastVy = prevPoints[id].vy;
      prevPoints[id].vx = dx;
      prevPoints[id].vy = dy;
      
      // Calculate acceleration
      let ax = prevPoints[id].vx - prevPoints[id].lastVx;
      let ay = prevPoints[id].vy - prevPoints[id].lastVy;
      let acceleration = sqrt(ax * ax + ay * ay);
      
      // Update position
      prevPoints[id].x = x;
      prevPoints[id].y = y;
      
      return {velocity: sqrt(dx * dx + dy * dy), acceleration};
    }

    // Add this function at the start to calculate color based on hand position
    function getColorBasedOnHandPosition() {
      // Calculate chest center
      let centerX = (leftShoulderX + rightShoulderX) / 2;
      let centerY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
      
      // Get reference heights
      let headHeight = noseY;
      let hipHeight = (hipY + hipY2) / 2;
      let highestHandY = min(leftHandY, rightHandY);  // Higher hands = smaller Y
      let lowestHandY = max(leftHandY, rightHandY);
      
      // Calculate distances for white transition
      let leftHandDist = dist(leftHandX, leftHandY, centerX, centerY);
      let rightHandDist = dist(rightHandX, rightHandY, centerX, centerY);
      let whiteTransition = map(min(leftHandDist, rightHandDist), 100, 300, 1, 0);
      whiteTransition = constrain(whiteTransition, 0, 1);
      
      // Calculate turquoise transition when hands are above head
      let turquoiseTransition = 0;
      if (highestHandY < headHeight) {
        turquoiseTransition = map(highestHandY, headHeight - 200, headHeight, 1, 0);
        turquoiseTransition = constrain(turquoiseTransition, 0, 1);
      }
      
      // Calculate yellow transition when hands are below hips
      let yellowTransition = 0;
      if (lowestHandY > hipHeight) {
        yellowTransition = map(lowestHandY, hipHeight, hipHeight + 200, 0, 1);
        yellowTransition = constrain(yellowTransition, 0, 1);
      }
      
      // Base color (red-pantone)
      let baseColor = {
        r: 231,
        g: 29,
        b: 54
      };
      
      // White color
      let whiteColor = {
        r: 253,
        g: 255,
        b: 252
      };
      
      // Turquoise color (light-sea-green)
      let turquoiseColor = {
        r: 46,
        g: 196,
        b: 182
      };
      
      // Yellow color (orange-peel)
      let yellowColor = {
        r: 255,
        g: 159,
        b: 28
      };
      
      // First interpolate between red and white based on proximity
      let intermediateColor = {
        r: lerp(baseColor.r, whiteColor.r, whiteTransition),
        g: lerp(baseColor.g, whiteColor.g, whiteTransition),
        b: lerp(baseColor.b, whiteColor.b, whiteTransition)
      };
      
      // Then interpolate to turquoise for high hands
      intermediateColor = {
        r: lerp(intermediateColor.r, turquoiseColor.r, turquoiseTransition),
        g: lerp(intermediateColor.g, turquoiseColor.g, turquoiseTransition),
        b: lerp(intermediateColor.b, turquoiseColor.b, turquoiseTransition)
      };
      
      // Finally interpolate to yellow for low hands
      return {
        r: lerp(intermediateColor.r, yellowColor.r, yellowTransition),
        g: lerp(intermediateColor.g, yellowColor.g, yellowTransition),
        b: lerp(intermediateColor.b, yellowColor.b, yellowTransition)
      };
    }

    // Update the colors object to use dynamic color
    const baseColor = getColorBasedOnHandPosition();
    const colors = {
      head: baseColor,
      torso: baseColor,
      arms: baseColor,
      hands: baseColor,
      legs: baseColor
    };

    // Add this function to calculate growth factor based on hand height
    function getGrowthFactor() {
      // Get head (nose) height as reference
      let headHeight = noseY;
      // Get highest hand position
      let handHeight = min(leftHandY, rightHandY);
      
      // Calculate growth factor when hands go above head
      let growthFactor = 1;
      if (handHeight < headHeight) {
        // Map growth from 1 to 2 based on how high hands are above head
        growthFactor = map(handHeight, headHeight - 200, headHeight, 2, 1);
        growthFactor = constrain(growthFactor, 1, 2);
      }
      
      return growthFactor;
    }

    // Modify drawElasticLine function to include growth
    function drawElasticLine(x1, y1, x2, y2, thickness, baseColor, id) {
      let growthFactor = getGrowthFactor();
      
      // Scale positions from center
      let centerX = (leftShoulderX + rightShoulderX) / 2;
      let centerY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
      
      // Apply growth to positions
      x1 = centerX + (x1 - centerX) * growthFactor;
      y1 = centerY + (y1 - centerY) * growthFactor;
      x2 = centerX + (x2 - centerX) * growthFactor;
      y2 = centerY + (y2 - centerY) * growthFactor;
      
      // Scale thickness
      thickness = thickness * growthFactor;
      
      // Use the dynamic color instead of the passed baseColor
      baseColor = getColorBasedOnHandPosition();
      
      // Store color for particles
      if (prevPoints[id]) {
        prevPoints[id].color = baseColor;
      }
      
      // Calculate velocity and acceleration for color change
      let motion = getVelocity(id, (x1 + x2)/2, (y1 + y2)/2);
      let speedMultiplier = map(motion.velocity, 0, 50, 0, 1);
      let accelMultiplier = map(motion.acceleration, 0, 10, 0, 1);
      
      // Create dynamic color based on movement
      let dynamicColor = {
        r: baseColor.r + sin(frameCount * 0.05) * 50 * speedMultiplier + accelMultiplier * 100,
        g: baseColor.g + cos(frameCount * 0.03) * 50 * speedMultiplier,
        b: baseColor.b + sin(frameCount * 0.04) * 50 * speedMultiplier
      };
      
      // Calculate spring effect
      let distance = dist(x1, y1, x2, y2);
      let springForce = map(distance, 0, 200, 0, 40);
      let midPointOffset = sin(frameCount * 0.05) * springForce;
      
      // Rest of the elastic line code remains the same, but use dynamicColor instead of color
      let mx = (x1 + x2) / 2;
      let my = (y1 + y2) / 2;
      
      let perpX = -(y2 - y1) / distance * midPointOffset;
      let perpY = (x2 - x1) / distance * midPointOffset;
      
      // Draw elastic glow effect with dynamic color
      noFill();
      for(let i = thickness*3; i > 0; i-=2) {
        let alpha = map(i, thickness*3, 0, 30 + (speedMultiplier * 50), 0);
        stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, alpha);
        strokeWeight(i + sin(frameCount * 0.1) * 2);
        
        beginShape();
        vertex(x1, y1);
        // Add multiple curve segments for more organic feel
        for(let t = 0; t <= 1; t += 0.2) {
          let px = bezierPoint(x1, mx + perpX, mx + perpX, x2, t);
          let py = bezierPoint(y1, my + perpY, my + perpY, y2, t);
          // Add subtle wobble
          let wobble = sin(t * PI * 2 + frameCount * 0.1) * 5;
          vertex(px + wobble, py + wobble);
        }
        vertex(x2, y2);
        endShape();
      }
      
      // Draw core line with dynamic color
      stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, 180);
      strokeWeight(thickness);
      beginShape();
      vertex(x1, y1);
      // More detailed core line
      for(let t = 0; t <= 1; t += 0.1) {
        let px = bezierPoint(x1, mx + perpX*1.2, mx + perpX*1.2, x2, t);
        let py = bezierPoint(y1, my + perpY*1.2, my + perpY*1.2, y2, t);
        let wobble = sin(t * PI * 4 + frameCount * 0.15) * 3;
        vertex(px + wobble, py + wobble);
      }
      vertex(x2, y2);
      endShape();
      
      // Add highlight effect with movement-based intensity
      stroke(231, 29, 54, 50 + (speedMultiplier * 100));  // red-pantone with variable opacity
      strokeWeight(thickness/3);
      beginShape();
      vertex(x1, y1);
      for(let t = 0; t <= 1; t += 0.1) {
        let px = bezierPoint(x1, mx + perpX*0.8, mx + perpX*0.8, x2, t);
        let py = bezierPoint(y1, my + perpY*0.8, my + perpY*0.8, y2, t);
        vertex(px, py);
      }
      vertex(x2, y2);
      endShape();
    }

    // Update the drawElasticBody calls to include unique IDs
    function drawElasticBody() {
      // All lines in white with different thicknesses
      drawElasticLine(leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, 8, 
        {r: 231, g: 29, b: 54}, 'shoulders');
      drawElasticLine(leftShoulderX, leftShoulderY, hipX2, hipY2, 8, 
        {r: 231, g: 29, b: 54}, 'leftTorso');
      drawElasticLine(rightShoulderX, rightShoulderY, hipX, hipY, 8, 
        {r: 231, g: 29, b: 54}, 'rightTorso');
      drawElasticLine(hipX, hipY, hipX2, hipY2, 8, 
        {r: 231, g: 29, b: 54}, 'hips');

      // Arms
      drawElasticLine(leftShoulderX, leftShoulderY, leftElbowX, leftElbowY, 6, 
        {r: 231, g: 29, b: 54}, 'leftUpperArm');
      drawElasticLine(leftElbowX, leftElbowY, leftHandX, leftHandY, 6, 
        {r: 231, g: 29, b: 54}, 'leftLowerArm');
      drawElasticLine(rightShoulderX, rightShoulderY, rightElbowX, rightElbowY, 6, 
        {r: 231, g: 29, b: 54}, 'rightUpperArm');
      drawElasticLine(rightElbowX, rightElbowY, rightHandX, rightHandY, 6, 
        {r: 231, g: 29, b: 54}, 'rightLowerArm');

      // Legs
      drawElasticLine(hipX, hipY, kneeX, kneeY, 7, 
        {r: 231, g: 29, b: 54}, 'rightUpperLeg');
      drawElasticLine(hipX2, hipY2, kneeX2, kneeY2, 7, 
        {r: 231, g: 29, b: 54}, 'leftUpperLeg');
      drawElasticLine(kneeX, kneeY, ankleX, ankleY, 7, 
        {r: 231, g: 29, b: 54}, 'rightLowerLeg');
      drawElasticLine(kneeX2, kneeY2, ankleX2, ankleY2, 7, 
        {r: 231, g: 29, b: 54}, 'leftLowerLeg');

      // Neck
      drawElasticLine((leftShoulderX + rightShoulderX)/2, (leftShoulderY + rightShoulderY)/2,
        noseX, noseY, 5, {r: 231, g: 29, b: 54}, 'neck');
    }

    drawElasticBody();

    // Add this function to draw the chest vortex
    function drawChestVortex(x, y) {
      let growthFactor = getGrowthFactor();
      
      // Scale base sizes
      let vortexSize = 150 * growthFactor;
      let numRings = 20;
      let numParticles = 24;
      let coreSize = 30 * growthFactor;
      
      // Calculate chest center
      let chestX = (leftShoulderX + rightShoulderX) / 2;
      let chestY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
      
      // Calculate distances from hands to vortex center
      let leftHandDist = dist(leftHandX, leftHandY, chestX, chestY);
      let rightHandDist = dist(rightHandX, rightHandY, chestX, chestY);
      
      // Calculate proximity effect and color transition
      let proximityEffect = map(min(leftHandDist, rightHandDist), 0, 300, 0.5, 0);
      proximityEffect = constrain(proximityEffect, 0, 0.5);
      
      // Color interpolation based on proximity
      let colorTransition = map(min(leftHandDist, rightHandDist), 100, 300, 1, 0);
      colorTransition = constrain(colorTransition, 0, 1);
      
      // Interpolate between red and white
      let vortexColor = {
        r: lerp(231, 253, colorTransition),  // Red to white
        g: lerp(29, 255, colorTransition),   // Green to white
        b: lerp(54, 252, colorTransition)    // Blue to white
      };
      
      // Get audio level
      audioLevel = micStarted ? mic.getLevel() * 3 : 0;
      let combinedEffect = audioLevel + (proximityEffect * 0.2);
      
      // Draw spinning rings
      noFill();
      for(let ring = 0; ring < numRings; ring++) {
        let ringRadius = map(ring, 0, numRings, vortexSize * 0.1, vortexSize);
        let rotationSpeed = 0.02 + (combinedEffect * 0.1);
        let rotationOffset = ring * PI/8 + frameCount * (ring % 2 === 0 ? rotationSpeed : -rotationSpeed);
        let alpha = map(ring, 0, numRings, 150 + (combinedEffect * 100), 20);
        
        beginShape();
        for(let i = 0; i <= numParticles; i++) {
          let angle = (i * TWO_PI / numParticles) + rotationOffset;
          let radius = ringRadius + sin(angle * 3 + frameCount * 0.05) * 10;
          let x = chestX + cos(angle) * radius;
          let y = chestY + sin(angle) * radius;
          
          stroke(vortexColor.r, vortexColor.g, vortexColor.b, alpha);
          strokeWeight(2 + sin(frameCount * 0.1 + ring) * 1);
          vertex(x, y);
        }
        endShape();
      }
      
      // Draw center glow
      noStroke();
      for(let r = coreSize; r > 0; r -= 2) {
        let alpha = map(r, coreSize, 0, 100 + (combinedEffect * 155), 0);
        fill(vortexColor.r, vortexColor.g, vortexColor.b, alpha);
        ellipse(chestX, chestY, r * 2);
      }
    }

    // Add this line after drawElasticBody() and before drawing cilia
    drawChestVortex();

    // Function to draw organic cilia/flagella with reaching behavior
    function drawCilia(x, y, size, count, color, nearbyPoints) {
      let growthFactor = getGrowthFactor();
      
      // Scale position from center
      let centerX = (leftShoulderX + rightShoulderX) / 2;
      let centerY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
      
      x = centerX + (x - centerX) * growthFactor;
      y = centerY + (y - centerY) * growthFactor;
      
      // Scale size
      size = size * growthFactor;
      
      // Scale nearby points
      nearbyPoints = nearbyPoints.map(point => {
        return {
          x: centerX + (point.x - centerX) * growthFactor,
          y: centerY + (point.y - centerY) * growthFactor
        };
      });
      
      // Use the dynamic color instead of the passed color
      color = getColorBasedOnHandPosition();
      
      // Add audio reactivity to size and movement
      let reactiveSize = size * (1 + audioLevel);  // Size response
      
      // Draw base glow
      noStroke();
      for (let r = reactiveSize/2; r > 0; r -= 4) {
        fill(color.r, color.g, color.b, 4 + (audioLevel * 10));
        ellipse(x, y, r * 3);
      }

      // Find closest points and their directions
      let attractions = nearbyPoints.map(point => {
        let dx = point.x - x;
        let dy = point.y - y;
        let dist = sqrt(dx * dx + dy * dy);
        let angle = atan2(dy, dx);
        return { dist, angle };
      });

      for (let i = 0; i < count; i++) {
        // Reduce rotation speed
        let baseAngle = (i * TWO_PI / count) + frameCount * 0.005;
        
        // Find the closest attraction point in this direction
        let closestAttraction = null;
        let minAngleDiff = PI/2; // Only consider points within 90 degrees
        
        attractions.forEach(attr => {
          let angleDiff = abs(((attr.angle - baseAngle + PI) % TWO_PI) - PI);
          if (angleDiff < minAngleDiff) {
            minAngleDiff = angleDiff;
            closestAttraction = attr;
          }
        });

        // Adjust angle and length based on nearby points
        let angle = baseAngle;
        let length = reactiveSize * 2;
        
        if (closestAttraction) {
          // Blend between base angle and attraction angle
          let blend = map(minAngleDiff, 0, PI/2, 0.6, 0);
          angle = lerp(baseAngle, closestAttraction.angle, blend);
          
          // Extend length based on distance
          let distanceInfluence = map(closestAttraction.dist, 0, 300, 0.5, 0);
          length *= (1 + distanceInfluence);
        }

        // Reduce wave movement speed
        let waveOffset = sin(frameCount * 0.025 + i * 0.25) * (30 + audioLevel * 50);
        length += waveOffset;
        
        // Draw organic tentacle
        beginShape();
        noFill();
        stroke(color.r, color.g, color.b, 120);
        strokeWeight(4 + sin(frameCount * 0.1 + i) * 3 + (audioLevel * 10));
        
        let points = [];
        for (let t = 0; t <= 1; t += 0.1) {
          // Reduce wave animation speeds
          let wave = sin(t * PI * 2 + frameCount * 0.05) * (60 + audioLevel * 120);
          let wave2 = cos(t * PI * 3 + frameCount * 0.075) * (45 + audioLevel * 90);
          
          // Add attraction influence to waves
          if (closestAttraction) {
            let attractionInfluence = map(t, 0, 1, 0, 1) * minAngleDiff;
            wave *= (1 - attractionInfluence);
            wave2 *= (1 - attractionInfluence);
          }
          
          let dx = x + cos(angle) * (length * t) + 
                   cos(angle + PI/2) * wave +
                   cos(angle + PI/4) * wave2;
          let dy = y + sin(angle) * (length * t) + 
                   sin(angle + PI/2) * wave +
                   sin(angle + PI/4) * wave2;
          points.push({x: dx, y: dy});
        }
        
        curveVertex(points[0].x, points[0].y);
        points.forEach(p => curveVertex(p.x, p.y));
        curveVertex(points[points.length-1].x, points[points.length-1].y);
        endShape();
        
        // Reduce glowing tips animation speed
        let tipSize = 10 + sin(frameCount * 0.1 + i) * 5;
        for(let g = tipSize; g > 0; g -= 2) {
          fill(color.r, color.g, color.b, map(g, tipSize, 0, 100, 0));
          ellipse(points[points.length-1].x, points[points.length-1].y, g * 2);
        }
      }
    }

    // Create array of all body points
    const bodyPoints = [
      {x: noseX, y: noseY},
      {x: leftShoulderX, y: leftShoulderY},
      {x: rightShoulderX, y: rightShoulderY},
      {x: leftElbowX, y: leftElbowY},
      {x: rightElbowX, y: rightElbowY},
      {x: leftHandX, y: leftHandY},
      {x: rightHandX, y: rightHandY},
      {x: hipX, y: hipY},
      {x: hipX2, y: hipY2},
      {x: kneeX, y: kneeY},
      {x: kneeX2, y: kneeY2},
      {x: ankleX, y: ankleY},
      {x: ankleX2, y: ankleY2}
    ];

    // Draw cilia with nearby point awareness
    drawCilia(noseX, noseY, 90, 28, colors.head, 
             bodyPoints.filter(p => p.x !== noseX || p.y !== noseY));
    
    drawCilia(leftShoulderX, leftShoulderY, 70, 20, colors.torso,
             bodyPoints.filter(p => p.x !== leftShoulderX || p.y !== leftShoulderY));
    
    drawCilia(rightShoulderX, rightShoulderY, 70, 20, colors.torso,
             bodyPoints.filter(p => p.x !== rightShoulderX || p.y !== rightShoulderY));
    
    drawCilia(leftElbowX, leftElbowY, 60, 16, colors.arms,
             bodyPoints.filter(p => p.x !== leftElbowX || p.y !== leftElbowY));
    
    drawCilia(rightElbowX, rightElbowY, 60, 16, colors.arms,
             bodyPoints.filter(p => p.x !== rightElbowX || p.y !== rightElbowY));
    
    drawCilia(leftHandX, leftHandY, 80, 24, colors.hands,
             bodyPoints.filter(p => p.x !== leftHandX || p.y !== leftHandY));
    
    drawCilia(rightHandX, rightHandY, 80, 24, colors.hands,
             bodyPoints.filter(p => p.x !== rightHandX || p.y !== rightHandY));
    
    drawCilia(hipX, hipY, 70, 20, colors.torso,
             bodyPoints.filter(p => p.x !== hipX || p.y !== hipY));
    
    drawCilia(hipX2, hipY2, 70, 20, colors.torso,
             bodyPoints.filter(p => p.x !== hipX2 || p.y !== hipY2));
    
    drawCilia(kneeX, kneeY, 60, 16, colors.legs,
             bodyPoints.filter(p => p.x !== kneeX || p.y !== kneeY));
    
    drawCilia(kneeX2, kneeY2, 60, 16, colors.legs,
             bodyPoints.filter(p => p.x !== kneeX2 || p.y !== kneeY2));
    
    drawCilia(ankleX, ankleY, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== ankleX || p.y !== ankleY));
    
    drawCilia(ankleX2, ankleY2, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== ankleX2 || p.y !== ankleY2));
    
    drawCilia(rightFootX, rightFootY, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== rightFootX || p.y !== rightFootY));
    
    drawCilia(leftFootX, leftFootY, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== leftFootX || p.y !== leftFootY));
    
    drawCilia(rightFoot2X, rightFoot2Y, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== rightFoot2X || p.y !== rightFoot2Y));
    
    drawCilia(leftFoot2X, leftFoot2Y, 50, 14, colors.legs,
             bodyPoints.filter(p => p.x !== leftFoot2X || p.y !== leftFoot2Y));

    // Update text color to red-pantone with low opacity
    fill('rgba(231, 29, 54, 0.15)');
    textSize(letterSize * 0.5);
    text("nose", noseX + 20, noseY); // nose
    text("left shoulder", leftShoulderX - 120, leftShoulderY); // left shoulder
    text("right shoulder", rightShoulderX + 20, rightShoulderY); // right shoulder
    text("left hand", leftHandX  - 120, leftHandY); // left hand
    text("right hand", rightHandX + 20, rightHandY); // right hand
    text("left elbow", leftElbowX  - 120, leftElbowY); // left elbow
    text("right elbow", rightElbowX + 20, rightElbowY); // right elbow
    text("right wrist", rightWristX + 20, rightWristY); // right wrist
    text("left wrist", leftWristX  - 120, leftWristY); // left wrist
    text("right hip", hipX + 20, hipY); // right hip
    text("left hip", hipX2  - 120, hipY2); // left hip
    text("right knee", kneeX + 20, kneeY); // right knee
    text("left knee", kneeX2  - 120, kneeY2); // left knee
    text("right ankle", ankleX + 20, ankleY); // right ankle
    text("left ankle", ankleX2  - 120, ankleY2); // left ankle
    text("right foot", rightFootX + 20, rightFootY); // right foot
    text("left foot", leftFootX  - 120, leftFootY); // left foot

    pop();

    // Update and draw center glow
    updateCenterGlow(leftHandX, leftHandY, rightHandX, rightHandY);
    drawCenterGlow();
    updateFloatingOrb();
    updatePerlinGlow();
  } else {  // if no hand tracking
    noStroke();
  }

  // Draw controls on top
  drawVideoControls();
  drawAudioIndicator();
}



/* - - Helper functions - - */

// function: launch webcam
function captureWebcam() {
  capture = createCapture(
    {
      audio: false,
      video: {
        facingMode: "user",
      },
    },
    function (e) {
      captureEvent = e;
      console.log(captureEvent.getTracks()[0].getSettings());
      // do things when video ready
      // until then, the video element will have no dimensions, or default 640x480
      capture.srcObject = e;

      setCameraDimensions(capture);
      mediaPipe.predictWebcam(capture);
      //mediaPipe.predictWebcam(parentDiv);
    }
  );
  capture.elt.setAttribute("playsinline", "");
  capture.hide();
}

// function: resize webcam depending on orientation
function setCameraDimensions(video) {

  const vidAspectRatio = video.width / video.height; // aspect ratio of the video


  const canvasAspectRatio = width / height; // aspect ratio of the canvas

  if (vidAspectRatio > canvasAspectRatio) {

    // Image is wider than canvas aspect ratio
    video.scaledHeight = height;
    video.scaledWidth = video.scaledHeight * vidAspectRatio;
  } else {
    // Image is taller than canvas aspect ratio
    video.scaledWidth = width;
    video.scaledHeight = video.scaledWidth / vidAspectRatio;
  }
}


// function: center our stuff
function centerOurStuff() {
  translate(width / 2 - capture.scaledWidth / 2, height / 2 - capture.scaledHeight / 2); // center the webcam
}

// function: window resize
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  setCameraDimensions(capture);
}

function keyPressed() {
  if (key === ' ') {  // Space bar
    // Toggle video
    if (isVideoPlaying) {
      backgroundVideo.pause();
      // Reset video to beginning
      backgroundVideo.time(0);
      isVideoPlaying = false;
      // Also stop audio
      mic.stop();
      isAudioStarted = false;
    } else {
      backgroundVideo.play();
      isVideoPlaying = true;
      // Also start audio
      userStartAudio();
      mic.start();
      isAudioStarted = true;
    }
  }
}

// Modify drawVideoControls to show both video and audio state
function drawVideoControls() {
  push();
  fill(255);
  noStroke();
  
  // Draw video/audio state indicator
  if (!isVideoPlaying) {
    // Draw play triangle
    triangle(width - 50, height - 40, 
            width - 50, height - 20, 
            width - 30, height - 30);
  } else {
    // Draw pause bars
    rect(width - 50, height - 40, 6, 20);
    rect(width - 40, height - 40, 6, 20);
  }
  
  // Draw audio indicator
  if (isAudioStarted) {
    fill(255, 255, 255, 200);
    ellipse(width - 70, height - 30, 10, 10);
  }
  
  pop();
}

// Add audio level visualization
function drawAudioIndicator() {
  if (isAudioStarted) {
    push();
    // Draw audio level meter
    let level = mic.getLevel() * audioMultiplier;
    fill(255, 255, 255, 200);
    // Base dot
    ellipse(width - 70, height - 30, 10, 10);
    // Audio level visualization
    noFill();
    stroke(255, 255, 255, 200);
    strokeWeight(2);
    let radius = map(level, 0, 1, 15, 40);
    ellipse(width - 70, height - 30, radius, radius);
    pop();
  }
}

// Modify the updateCenterGlow function to be more stable
function updateCenterGlow(leftHandX, leftHandY, rightHandX, rightHandY) {
  try {
    // Safety checks
    if (!leftShoulderX || !rightShoulderX || !hipY || !hipY2) {
      return;
    }

    // Calculate body center with safety
    let bodyX = width/2;
    let bodyY = height/2;
    
    try {
      bodyX = (leftShoulderX + rightShoulderX) / 2;
      bodyY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
    } catch (e) {
      console.log("Using fallback body position");
    }

    // Initialize glow position if needed
    if (!centerGlow.x) centerGlow.x = bodyX;
    if (!centerGlow.y) centerGlow.y = bodyY;
    
    // Simple organic movement
    let timeOffset = frameCount * 0.01;
    let targetX = bodyX + cos(timeOffset) * 50;
    let targetY = bodyY + sin(timeOffset * 0.7) * 50;
    
    // Smooth position updates
    centerGlow.x = lerp(centerGlow.x, targetX, 0.03);
    centerGlow.y = lerp(centerGlow.y, targetY, 0.03);
    
    // Simple intensity calculation
    let handsDist = dist(leftHandX || 0, leftHandY || 0, rightHandX || 0, rightHandY || 0);
    let targetGlow = 0.3; // Base intensity
    
    if (handsDist < 200) {
      targetGlow += map(handsDist, 200, 0, 0, 0.5);
    }
    
    centerGlow.intensity = lerp(centerGlow.intensity || 0, targetGlow, 0.1);
    
  } catch (e) {
    console.log("Error in updateCenterGlow:", e);
  }
}

// Simplify the drawCenterGlow function
function drawCenterGlow() {
  try {
    if (!centerGlow.intensity) return;
    
    push();
    blendMode(ADD);
    
    // Simple pulsing
    let pulse = sin(frameCount * 0.03) * 0.2 + 1;
    
    // Draw glow layers
    for (let i = 0; i < 8; i++) {
      let size = map(i, 0, 7, 40, 200);
      let alpha = map(i, 0, 7, 150, 0) * centerGlow.intensity;
      
      noStroke();
      fill(255, 200, 50, alpha);
      ellipse(centerGlow.x, centerGlow.y, size * pulse, size * pulse);
    }
    
    // Draw core
    let coreSize = 20 * pulse;
    fill(255, 255, 200, 200 * centerGlow.intensity);
    ellipse(centerGlow.x, centerGlow.y, coreSize, coreSize);
    
    blendMode(BLEND);
    pop();
  } catch (e) {
    console.log("Error in drawCenterGlow:", e);
  }
}

// Modify the updateFloatingOrb function to be more stable
function updateFloatingOrb() {
  // Safety checks for undefined variables
  if (typeof leftShoulderX === 'undefined' || 
      typeof rightShoulderX === 'undefined' || 
      typeof hipY === 'undefined') {
    return;
  }

  try {
    // Get body center point with safety checks
    let bodyX = width/2;
    let bodyY = height/2;
    
    if (leftShoulderX && rightShoulderX && hipY && hipY2) {
      bodyX = (leftShoulderX + rightShoulderX) / 2;
      bodyY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
    }
    
    // Initialize orb position if needed
    if (floatingOrb.x === 0) {
      floatingOrb.x = bodyX;
      floatingOrb.y = bodyY;
    }
    
    // Update orbit angle more slowly
    floatingOrb.angle += 0.005;
    
    // Calculate orbit position with constrained radius
    let radius = constrain(floatingOrb.radius, 100, 300);
    let targetX = bodyX + cos(floatingOrb.angle) * radius;
    let targetY = bodyY + sin(floatingOrb.angle) * radius;
    
    // Smooth position updates with safety checks
    floatingOrb.x = lerp(floatingOrb.x, targetX, 0.03);
    floatingOrb.y = lerp(floatingOrb.y, targetY, 0.03);
    
    // Update color more slowly
    floatingOrb.hue = (floatingOrb.hue + 0.2) % 360;
    
    // Draw the orb
    push();
    blendMode(ADD);
    
    // Draw outer glow
    for (let i = 0; i < 5; i++) {
      let size = 30 * (1 + i * 0.5);
      let alpha = map(i, 0, 4, 100, 0);
      let pulse = sin(frameCount * 0.03) * 0.2 + 1;
      size *= pulse;
      
      noStroke();
      colorMode(HSB);
      fill(floatingOrb.hue, 80, 100, alpha);
      ellipse(floatingOrb.x, floatingOrb.y, size, size);
    }
    
    // Draw core
    let coreSize = 15;
    let corePulse = sin(frameCount * 0.05) * 0.2 + 1;
    fill(floatingOrb.hue, 60, 100, 150);
    ellipse(floatingOrb.x, floatingOrb.y, coreSize * corePulse, coreSize * corePulse);
    
    // Draw center
    fill(floatingOrb.hue, 30, 100, 200);
    ellipse(floatingOrb.x, floatingOrb.y, coreSize * 0.3, coreSize * 0.3);
    
    blendMode(BLEND);
    pop();
  } catch (e) {
    console.log("Error in updateFloatingOrb:", e);
  }
}

// Modify the updatePerlinGlow function to fade with video progress
function updatePerlinGlow() {
  try {
    // Calculate video progress
    let videoProgress = 0;
    if (backgroundVideo && isVideoPlaying) {
      videoProgress = backgroundVideo.time() / backgroundVideo.duration();
      // Fade out in the last 20% of the video
      if (videoProgress > 0.8) {
        perlinGlow.opacity = map(videoProgress, 0.8, 1, 1, 0);
      } else {
        perlinGlow.opacity = 1;
      }
    }
    
    // Don't render if fully transparent
    if (perlinGlow.opacity <= 0) return;
    
    // Rest of position calculations...
    perlinGlow.noiseOffsetX += perlinGlow.speed;
    perlinGlow.noiseOffsetY += perlinGlow.speed;
    
    let angle = noise(perlinGlow.noiseOffsetX) * TWO_PI * 2;
    let radius = noise(perlinGlow.noiseOffsetY) * 200 + 600;
    
    let targetX = width/2 + cos(angle) * radius;
    let targetY = height/2 + sin(angle) * radius;
    
    if (perlinGlow.x === 0) {
      perlinGlow.x = targetX;
      perlinGlow.y = targetY;
    }
    
    perlinGlow.x = lerp(perlinGlow.x, targetX, 0.005);
    perlinGlow.y = lerp(perlinGlow.y, targetY, 0.005);
    
    // Drawing with opacity
    push();
    blendMode(ADD);
    
    let pulse = sin(frameCount * 0.01) * 0.3 + 1.2;
    
    // Apply opacity to all glow elements with smaller sizes
    for (let i = 0; i < 12; i++) {
      let size = perlinGlow.size * (1.5 + i * 0.3) * pulse;  // Reduced multipliers
      let alpha = map(i, 0, 11, 150, 0) * perlinGlow.opacity;
      
      noStroke();
      fill(255, 200, 100, alpha);
      ellipse(perlinGlow.x, perlinGlow.y, size, size);
    }
    
    // Smaller core
    let coreSize = perlinGlow.size * 0.3 * pulse;  // Reduced from 0.5 to 0.3
    fill(255, 220, 150, 200 * perlinGlow.opacity);
    ellipse(perlinGlow.x, perlinGlow.y, coreSize, coreSize);
    
    // Smaller center
    fill(255, 255, 200, 255 * perlinGlow.opacity);
    ellipse(perlinGlow.x, perlinGlow.y, coreSize * 0.3, coreSize * 0.3);  // Reduced from 0.5 to 0.3
    
    blendMode(BLEND);
    pop();
    
  } catch (e) {
    console.log("Error in updatePerlinGlow:", e);
  }
}
