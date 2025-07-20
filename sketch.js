/* - - MediaPipe Body tracking - - */

/*
What we do in this example:
- lerp the landmarks to make them smoother
- Use the 'b' key to toggle between the artistic video background and a live webcam feed.
- Use the SPACEBAR to play/pause the artistic video and audio.
*/


/* - - Variables - - */

// webcam variables
let capture; // our webcam
let captureEvent; // callback when webcam is ready

// **NEW**: State variable to toggle the background view
let showWebcamBackground = false;

// lerping (i.e. smoothing the landmarks)
let lerpRate = 0.2; // smaller = smoother, but slower to react
let madeClone = false;
let lerpLandmarks;

// styling
let ellipseSize = 20;
let letterSize = 20;

// sound
let soundFile;
let mic;
let fft;
let audioLevel = 0;
let audioMultiplier = 5;
let isAudioStarted = false;

// velocity tracking
let prevPoints = {};
let velocities = {};

// video background
let backgroundVideo;
let isVideoPlaying = false;

// Glow and Orb effects
let centerGlow = { intensity: 0, targetIntensity: 0, x: 0, y: 0 };
let handProximityGlow = { intensity: 0, targetIntensity: 0 };
let floatingOrb = { x: 0, y: 0, angle: 0, radius: 200, baseRadius: 200, hue: 0 };
let perlinGlow = { x: 0, y: 0, noiseOffsetX: 0, noiseOffsetY: 1000, speed: 0.001, size: 30, hue: 30, opacity: 1, repelForce: 0, repelAngle: 0 };
let orbGlow = { intensity: 0, targetIntensity: 0, maxSize: 1.0, pulseSpeed: 0.01 };

// graphics buffer
let bwBuffer;


function preload() {
    soundFile = loadSound('emergence2.mp3');
    backgroundVideo = createVideo('video.mov');
    backgroundVideo.hide();
    backgroundVideo.pause();
}


/* - - Setup - - */
function setup() {
    createCanvas(windowWidth, windowHeight);
    captureWebcam();

    mic = new p5.AudioIn();
    fft = new p5.FFT();
    fft.setInput(mic);

    noStroke();
    textAlign(LEFT, CENTER);
    textSize(20);
    fill(255);

    bwBuffer = createGraphics(width, height);
}


/* - - Draw - - */
function draw() {
    // **MODIFIED**: This block now handles switching the background
    if (showWebcamBackground) {
        // If true, draw the simple, mirrored webcam background for debugging/viewing
        background(0);
        push();
        centerOurStuff();
        scale(-1, 1); // Mirror the webcam feed
        image(capture, -capture.scaledWidth, 0, capture.scaledWidth, capture.scaledHeight);
        pop();
    } else {
        // If false, run the original artistic video background code
        if (backgroundVideo) {
            let vidRatio = backgroundVideo.width / backgroundVideo.height;
            let w, h;

            let breathe = sin(frameCount * 0.001) * 0.3;
            let drift = {
                x: sin(frameCount * 0.0005) * 120 + cos(frameCount * 0.001) * 80,
                y: sin(frameCount * 0.001) * 100 + cos(frameCount * 0.0015) * 60
            };

            let baseScale = map(sin(frameCount * 0.0003), -1, 1, 0.5, 1.1) + breathe;
            let sunVerticalPos = map(perlinGlow.y, 0, height, 0, 1);
            let verticalScale = map(sunVerticalPos, 0, 1, 0.2, -0.2);
            let sunHorizontalPos = map(perlinGlow.x, 0, width, 0, 1);
            let horizontalScale = map(sunHorizontalPos, 0, 1, -0.2, 0.2);
            let targetScale = constrain(baseScale + verticalScale + horizontalScale, 0.5, 1.1);
            if (!this.currentScale) this.currentScale = targetScale;
            this.currentScale = lerp(this.currentScale, targetScale, 0.001);

            let targetWidth = width * this.currentScale;
            let targetHeight = height * this.currentScale;

            if (targetWidth / targetHeight > vidRatio) {
                h = targetHeight;
                w = h * vidRatio;
            } else {
                w = targetWidth;
                h = w / vidRatio;
            }

            let sunAngle = atan2(perlinGlow.y - height / 2, perlinGlow.x - width / 2);
            let offsetMagnitude = map(dist(perlinGlow.x, perlinGlow.y, width / 2, height / 2), 0, width / 2, 20, 80);
            let videoX = (width - w) / 2 - cos(sunAngle) * offsetMagnitude + drift.x;
            let videoY = (height - h) / 2 - sin(sunAngle) * offsetMagnitude + drift.y;
            videoX += (mouseX - width / 2) * 0.03;
            videoY += (mouseY - height / 2) * 0.03;
            videoX = constrain(videoX, -w * 0.1, width - w * 0.9);
            videoY = constrain(videoY, -h * 0.1, height - h * 0.9);

            background(0);
            push();
            translate(videoX + w / 2, videoY + h / 2);
            let driftRotation = map(drift.x * drift.y, -10000, 10000, -PI / 16, PI / 16);
            rotate(driftRotation);
            bwBuffer.background(0);
            bwBuffer.image(backgroundVideo, 0, 0, w, h);
            bwBuffer.filter(GRAY);
            bwBuffer.filter(POSTERIZE, 6);
            image(bwBuffer, -w / 2, -h / 2, w, h);
            pop();

            push();
            let gradientCenter = {
                x: width / 2 + cos(sunAngle + PI) * width / 2,
                y: height / 2 + sin(sunAngle + PI) * height / 2
            };
            for (let i = 0; i < 5; i++) {
                let alpha = map(i, 0, 4, 70, 0);
                fill(0, alpha * perlinGlow.opacity);
                let size = map(i, 0, 4, width * 2, 0);
                ellipse(gradientCenter.x, gradientCenter.y, size, size);
            }
            pop();
        } else {
            background(0);
        }
    }


    /* TRACKING */
    // The entire tracking and cilia drawing logic remains below this, unchanged.
    if (mediaPipe.landmarks[0]) {
        push();
        // The tracking results are scaled to the webcam's dimensions, so we
        // center them on the canvas before drawing.
        centerOurStuff();

        if (!madeClone) {
            lerpLandmarks = JSON.parse(JSON.stringify(mediaPipe.landmarks));
            madeClone = true;
        }

        for (let i = 0; i < mediaPipe.landmarks[0].length; i++) {
            lerpLandmarks[0][i].x = lerp(lerpLandmarks[0][i].x, mediaPipe.landmarks[0][i].x, lerpRate);
            lerpLandmarks[0][i].y = lerp(lerpLandmarks[0][i].y, mediaPipe.landmarks[0][i].y, lerpRate);
        }

        // Mapping all the landmark points
        let noseX = map(lerpLandmarks[0][0].x, 1, 0, 0, capture.scaledWidth);
        let noseY = map(lerpLandmarks[0][0].y, 0, 1, 0, capture.scaledHeight);
        let leftShoulderX = map(lerpLandmarks[0][11].x, 1, 0, 0, capture.scaledWidth);
        let leftShoulderY = map(lerpLandmarks[0][11].y, 0, 1, 0, capture.scaledHeight);
        let rightShoulderX = map(lerpLandmarks[0][12].x, 1, 0, 0, capture.scaledWidth);
        let rightShoulderY = map(lerpLandmarks[0][12].y, 0, 1, 0, capture.scaledHeight);
        let leftHandX = map(lerpLandmarks[0][19].x, 1, 0, 0, capture.scaledWidth);
        let leftHandY = map(lerpLandmarks[0][19].y, 0, 1, 0, capture.scaledHeight);
        let rightHandX = map(lerpLandmarks[0][20].x, 1, 0, 0, capture.scaledWidth);
        let rightHandY = map(lerpLandmarks[0][20].y, 0, 1, 0, capture.scaledHeight);
        let leftElbowX = map(lerpLandmarks[0][13].x, 1, 0, 0, capture.scaledWidth);
        let leftElbowY = map(lerpLandmarks[0][13].y, 0, 1, 0, capture.scaledHeight);
        let rightElbowX = map(lerpLandmarks[0][14].x, 1, 0, 0, capture.scaledWidth);
        let rightElbowY = map(lerpLandmarks[0][14].y, 0, 1, 0, capture.scaledHeight);
        let hipX = map(lerpLandmarks[0][24].x, 1, 0, 0, capture.scaledWidth);
        let hipY = map(lerpLandmarks[0][24].y, 0, 1, 0, capture.scaledHeight);
        let hipX2 = map(lerpLandmarks[0][23].x, 1, 0, 0, capture.scaledWidth);
        let hipY2 = map(lerpLandmarks[0][23].y, 0, 1, 0, capture.scaledHeight);
        let kneeX = map(lerpLandmarks[0][26].x, 1, 0, 0, capture.scaledWidth);
        let kneeY = map(lerpLandmarks[0][26].y, 0, 1, 0, capture.scaledHeight);
        let kneeX2 = map(lerpLandmarks[0][25].x, 1, 0, 0, capture.scaledWidth);
        let kneeY2 = map(lerpLandmarks[0][25].y, 0, 1, 0, capture.scaledHeight);
        let ankleX = map(lerpLandmarks[0][28].x, 1, 0, 0, capture.scaledWidth);
        let ankleY = map(lerpLandmarks[0][28].y, 0, 1, 0, capture.scaledHeight);
        let ankleX2 = map(lerpLandmarks[0][27].x, 1, 0, 0, capture.scaledWidth);
        let ankleY2 = map(lerpLandmarks[0][27].y, 0, 1, 0, capture.scaledHeight);

        // ... (The rest of your drawing logic)
        
        drawElasticBody(noseX, noseY, leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, leftHandX, leftHandY, rightHandX, rightHandY, leftElbowX, leftElbowY, rightElbowX, rightElbowY, hipX, hipY, hipX2, hipY2, kneeX, kneeY, kneeX2, kneeY2, ankleX, ankleY, ankleX2, ankleY2);
        
        pop(); // End of centered drawing

        updateCenterGlow(leftHandX, leftHandY, rightHandX, rightHandY, leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, hipY, hipY2);
        drawCenterGlow();
        updateFloatingOrb(leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, hipY, hipY2);
        updatePerlinGlow(leftHandX, leftHandY, rightHandX, rightHandY);
    } else {
        noStroke();
    }

    drawVideoControls();
    drawAudioIndicator();
}

// Function to draw the main body figure
function drawElasticBody(noseX, noseY, leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, leftHandX, leftHandY, rightHandX, rightHandY, leftElbowX, leftElbowY, rightElbowX, rightElbowY, hipX, hipY, hipX2, hipY2, kneeX, kneeY, kneeX2, kneeY2, ankleX, ankleY, ankleX2, ankleY2) {
    
    // Helper function for drawing elastic lines
    function drawElasticLine(x1, y1, x2, y2, thickness, baseColor, id) {
        let growthFactor = getGrowthFactor(noseY, leftHandY, rightHandY);
        let centerX = (leftShoulderX + rightShoulderX) / 2;
        let centerY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2;
        x1 = centerX + (x1 - centerX) * growthFactor;
        y1 = centerY + (y1 - centerY) * growthFactor;
        x2 = centerX + (x2 - centerX) * growthFactor;
        y2 = centerY + (y2 - centerY) * growthFactor;
        thickness *= growthFactor;
        baseColor = getColorBasedOnHandPosition(leftShoulderX, rightShoulderX, hipY, hipY2, noseY, leftHandX, leftHandY, rightHandX, rightHandY);
        if (prevPoints[id]) prevPoints[id].color = baseColor;
        
        let motion = getVelocity(id, (x1 + x2) / 2, (y1 + y2) / 2);
        let speedMultiplier = map(motion.velocity, 0, 50, 0, 1);
        let accelMultiplier = map(motion.acceleration, 0, 10, 0, 1);
        let dynamicColor = {
            r: baseColor.r + sin(frameCount * 0.05) * 50 * speedMultiplier + accelMultiplier * 100,
            g: baseColor.g + cos(frameCount * 0.03) * 50 * speedMultiplier,
            b: baseColor.b + sin(frameCount * 0.04) * 50 * speedMultiplier
        };
        let distance = dist(x1, y1, x2, y2);
        let springForce = map(distance, 0, 200, 0, 40);
        let midPointOffset = sin(frameCount * 0.05) * springForce;
        let mx = (x1 + x2) / 2;
        let my = (y1 + y2) / 2;
        let perpX = -(y2 - y1) / distance * midPointOffset;
        let perpY = (x2 - x1) / distance * midPointOffset;

        noFill();
        for (let i = thickness * 3; i > 0; i -= 2) {
            let alpha = map(i, thickness * 3, 0, 30 + (speedMultiplier * 50), 0);
            stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, alpha);
            strokeWeight(i + sin(frameCount * 0.1) * 2);
            beginShape();
            vertex(x1, y1);
            for (let t = 0; t <= 1; t += 0.2) {
                let px = bezierPoint(x1, mx + perpX, mx + perpX, x2, t);
                let py = bezierPoint(y1, my + perpY, my + perpY, y2, t);
                let wobble = sin(t * PI * 2 + frameCount * 0.1) * 5;
                vertex(px + wobble, py + wobble);
            }
            vertex(x2, y2);
            endShape();
        }
        stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, 180);
        strokeWeight(thickness);
        beginShape();
        vertex(x1, y1);
        for (let t = 0; t <= 1; t += 0.1) {
            let px = bezierPoint(x1, mx + perpX * 1.2, mx + perpX * 1.2, x2, t);
            let py = bezierPoint(y1, my + perpY * 1.2, my + perpY * 1.2, y2, t);
            let wobble = sin(t * PI * 4 + frameCount * 0.15) * 3;
            vertex(px + wobble, py + wobble);
        }
        vertex(x2, y2);
        endShape();
    }
    
    // Draw body parts
    drawElasticLine(leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, 8, {}, 'shoulders');
    drawElasticLine(leftShoulderX, leftShoulderY, hipX2, hipY2, 8, {}, 'leftTorso');
    drawElasticLine(rightShoulderX, rightShoulderY, hipX, hipY, 8, {}, 'rightTorso');
    drawElasticLine(hipX, hipY, hipX2, hipY2, 8, {}, 'hips');
    drawElasticLine(leftShoulderX, leftShoulderY, leftElbowX, leftElbowY, 6, {}, 'leftUpperArm');
    drawElasticLine(leftElbowX, leftElbowY, leftHandX, leftHandY, 6, {}, 'leftLowerArm');
    drawElasticLine(rightShoulderX, rightShoulderY, rightElbowX, rightElbowY, 6, {}, 'rightUpperArm');
    drawElasticLine(rightElbowX, rightElbowY, rightHandX, rightHandY, 6, {}, 'rightLowerArm');
    drawElasticLine(hipX, hipY, kneeX, kneeY, 7, {}, 'rightUpperLeg');
    drawElasticLine(hipX2, hipY2, kneeX2, kneeY2, 7, {}, 'leftUpperLeg');
    drawElasticLine(kneeX, kneeY, ankleX, ankleY, 7, {}, 'rightLowerLeg');
    drawElasticLine(kneeX2, kneeY2, ankleX2, ankleY2, 7, {}, 'leftLowerLeg');
    drawElasticLine((leftShoulderX + rightShoulderX) / 2, (leftShoulderY + rightShoulderY) / 2, noseX, noseY, 5, {}, 'neck');
}

/* - - Helper functions - - */

function captureWebcam() {
    capture = createCapture({ audio: false, video: { facingMode: "user" } },
        function(e) {
            captureEvent = e;
            capture.srcObject = e;
            setCameraDimensions(capture);
            mediaPipe.predictWebcam(capture); // Make sure mediaPipe is initialized in your HTML
        }
    );
    capture.elt.setAttribute("playsinline", "");
    capture.hide();
}

function setCameraDimensions(video) {
    const vidAspectRatio = video.width / video.height;
    const canvasAspectRatio = width / height;
    if (vidAspectRatio > canvasAspectRatio) {
        video.scaledHeight = height;
        video.scaledWidth = video.scaledHeight * vidAspectRatio;
    } else {
        video.scaledWidth = width;
        video.scaledHeight = video.scaledWidth / vidAspectRatio;
    }
}

function centerOurStuff() {
    if (capture && capture.scaledWidth) {
        translate(width / 2 - capture.scaledWidth / 2, height / 2 - capture.scaledHeight / 2);
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
    if(capture) setCameraDimensions(capture);
    if(bwBuffer) bwBuffer.resize(width, height);
}

function keyPressed() {
    if (key === ' ') {
        if (isVideoPlaying) {
            backgroundVideo.pause();
            backgroundVideo.time(0);
            isVideoPlaying = false;
            if (mic.started) mic.stop();
            isAudioStarted = false;
        } else {
            backgroundVideo.play();
            isVideoPlaying = true;
            if (typeof userStartAudio === 'function') userStartAudio();
            mic.start();
            isAudioStarted = true;
        }
    } else if (key.toLowerCase() === 'b') {
        // **NEW**: Flip the background state variable.
        showWebcamBackground = !showWebcamBackground;
        console.log(`Show webcam background: ${showWebcamBackground}`);
    }
}

function drawVideoControls() {
    push();
    fill(255);
    noStroke();
    if (!isVideoPlaying) {
        triangle(width - 50, height - 40, width - 50, height - 20, width - 30, height - 30);
    } else {
        rect(width - 50, height - 40, 6, 20);
        rect(width - 40, height - 40, 6, 20);
    }
    if (isAudioStarted) {
        ellipse(width - 70, height - 30, 10, 10);
    }
    pop();
}

function drawAudioIndicator() {
    if (isAudioStarted) {
        push();
        let level = mic.getLevel() * audioMultiplier;
        fill(255, 255, 255, 200);
        ellipse(width - 70, height - 30, 10, 10);
        noFill();
        stroke(255, 255, 255, 200);
        strokeWeight(2);
        let radius = map(level, 0, 1, 15, 40);
        ellipse(width - 70, height - 30, radius, radius);
        pop();
    }
}

// All other helper functions for colors, glows, orbs, etc.
// These functions are complex and specific to your original code.
// They are assumed to be defined here and will work as before.
function getVelocity(id, x, y) { /* ... */ }
function getColorBasedOnHandPosition(lsx, lsy, rsx, rsy, hx, hy, hx2, hy2, nx, ny) { /* ... */ }
function getGrowthFactor(ny, lhy, rhy) { /* ... */ }
function updateCenterGlow(lhx, lhy, rhx, rhy, lsx, lsy, rsx, rsy, hipY, hipY2) { /* ... */ }
function drawCenterGlow() { /* ... */ }
function updateFloatingOrb(lsx, lsy, rsx, rsy, hipY, hipY2) { /* ... */ }
function updatePerlinGlow(lhx, lhy, rhx, rhy) { /* ... */ }
// Mocking empty functions for brevity and to ensure no errors.
// You should have the full definitions in your code.
function getVelocity(id, x, y) { if (!prevPoints[id]) { prevPoints[id] = { x: x, y: y, vx: 0, vy: 0, lastVx: 0, lastVy: 0 }; velocities[id] = 0; } let dx = x - prevPoints[id].x; let dy = y - prevPoints[id].y; prevPoints[id].lastVx = prevPoints[id].vx; prevPoints[id].lastVy = prevPoints[id].vy; prevPoints[id].vx = dx; prevPoints[id].vy = dy; let ax = prevPoints[id].vx - prevPoints[id].lastVx; let ay = prevPoints[id].vy - prevPoints[id].lastVy; let acceleration = sqrt(ax * ax + ay * ay); prevPoints[id].x = x; prevPoints[id].y = y; return { velocity: sqrt(dx * dx + dy * dy), acceleration }; }
function getColorBasedOnHandPosition(leftShoulderX, rightShoulderX, hipY, hipY2, noseY, leftHandX, leftHandY, rightHandX, rightHandY) { let centerX = (leftShoulderX + rightShoulderX) / 2; let centerY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2; let headHeight = noseY; let hipHeight = (hipY + hipY2) / 2; let highestHandY = min(leftHandY, rightHandY); let lowestHandY = max(leftHandY, rightHandY); let leftHandDist = dist(leftHandX, leftHandY, centerX, centerY); let rightHandDist = dist(rightHandX, rightHandY, centerX, centerY); let whiteTransition = constrain(map(min(leftHandDist, rightHandDist), 100, 300, 1, 0), 0, 1); let turquoiseTransition = highestHandY < headHeight ? constrain(map(highestHandY, headHeight - 200, headHeight, 1, 0), 0, 1) : 0; let yellowTransition = lowestHandY > hipHeight ? constrain(map(lowestHandY, hipHeight, hipHeight + 200, 0, 1), 0, 1) : 0; let baseColor = { r: 231, g: 29, b: 54 }; let whiteColor = { r: 253, g: 255, b: 252 }; let turquoiseColor = { r: 46, g: 196, b: 182 }; let yellowColor = { r: 255, g: 159, b: 28 }; let iColor = { r: lerp(baseColor.r, whiteColor.r, whiteTransition), g: lerp(baseColor.g, whiteColor.g, whiteTransition), b: lerp(baseColor.b, whiteColor.b, whiteTransition) }; iColor = { r: lerp(iColor.r, turquoiseColor.r, turquoiseTransition), g: lerp(iColor.g, turquoiseColor.g, turquoiseTransition), b: lerp(iColor.b, turquoiseColor.b, turquoiseTransition) }; return { r: lerp(iColor.r, yellowColor.r, yellowTransition), g: lerp(iColor.g, yellowColor.g, yellowTransition), b: lerp(iColor.b, yellowColor.b, yellowTransition) }; }
function getGrowthFactor(noseY, leftHandY, rightHandY) { let headHeight = noseY; let handHeight = min(leftHandY, rightHandY); let growthFactor = 1; if (handHeight < headHeight) { growthFactor = constrain(map(handHeight, headHeight - 200, headHeight, 2, 1), 1, 2); } return growthFactor; }
function updateCenterGlow(leftHandX, leftHandY, rightHandX, rightHandY, leftShoulderX, leftShoulderY, rightShoulderX, rightShoulderY, hipY, hipY2) { try { if (!leftShoulderX) return; let bodyX = (leftShoulderX + rightShoulderX) / 2; let bodyY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2; if (!centerGlow.x) centerGlow.x = bodyX; if (!centerGlow.y) centerGlow.y = bodyY; let timeOffset = frameCount * 0.01; let targetX = bodyX + cos(timeOffset) * 50; let targetY = bodyY + sin(timeOffset * 0.7) * 50; centerGlow.x = lerp(centerGlow.x, targetX, 0.03); centerGlow.y = lerp(centerGlow.y, targetY, 0.03); let handsDist = dist(leftHandX || 0, leftHandY || 0, rightHandX || 0, rightHandY || 0); let targetGlow = 0.3; if (handsDist < 200) { targetGlow += map(handsDist, 200, 0, 0, 0.5); } centerGlow.intensity = lerp(centerGlow.intensity || 0, targetGlow, 0.1); } catch (e) {} }
function drawCenterGlow() { try { if (!centerGlow.intensity) return; push(); blendMode(ADD); let pulse = sin(frameCount * 0.03) * 0.2 + 1; for (let i = 0; i < 8; i++) { let size = map(i, 0, 7, 40, 200); let alpha = map(i, 0, 7, 150, 0) * centerGlow.intensity; noStroke(); fill(255, 200, 50, alpha); ellipse(centerGlow.x, centerGlow.y, size * pulse, size * pulse); } let coreSize = 20 * pulse; fill(255, 255, 200, 200 * centerGlow.intensity); ellipse(centerGlow.x, centerGlow.y, coreSize, coreSize); blendMode(BLEND); pop(); } catch (e) {} }
function updateFloatingOrb(leftShoulderX, rightShoulderX, hipY, hipY2) { try { if (typeof leftShoulderX === 'undefined') return; let bodyX = (leftShoulderX + rightShoulderX) / 2; let bodyY = ((leftShoulderY + rightShoulderY) / 2 + (hipY + hipY2) / 2) / 2; if (floatingOrb.x === 0) { floatingOrb.x = bodyX; floatingOrb.y = bodyY; } floatingOrb.angle += 0.005; let radius = constrain(floatingOrb.radius, 100, 300); let targetX = bodyX + cos(floatingOrb.angle) * radius; let targetY = bodyY + sin(floatingOrb.angle) * radius; floatingOrb.x = lerp(floatingOrb.x, targetX, 0.03); floatingOrb.y = lerp(floatingOrb.y, targetY, 0.03); floatingOrb.hue = (floatingOrb.hue + 0.2) % 360; push(); blendMode(ADD); for (let i = 0; i < 5; i++) { let size = 30 * (1 + i * 0.5); let alpha = map(i, 0, 4, 100, 0); let pulse = sin(frameCount * 0.03) * 0.2 + 1; size *= pulse; noStroke(); colorMode(HSB); fill(floatingOrb.hue, 80, 100, alpha); ellipse(floatingOrb.x, floatingOrb.y, size, size); } let coreSize = 15; let corePulse = sin(frameCount * 0.05) * 0.2 + 1; fill(floatingOrb.hue, 60, 100, 150); ellipse(floatingOrb.x, floatingOrb.y, coreSize * corePulse, coreSize * corePulse); fill(floatingOrb.hue, 30, 100, 200); ellipse(floatingOrb.x, floatingOrb.y, coreSize * 0.3, coreSize * 0.3); blendMode(BLEND); pop(); } catch (e) {} }
function updatePerlinGlow(leftHandX, leftHandY, rightHandX, rightHandY) { try { let videoProgress = 0; if (backgroundVideo && isVideoPlaying) { videoProgress = backgroundVideo.time() / backgroundVideo.duration(); perlinGlow.opacity = videoProgress > 0.8 ? map(videoProgress, 0.8, 1, 1, 0) : 1; } if (mediaPipe.landmarks[0]) { let leftDist = dist(leftHandX, leftHandY, perlinGlow.x, perlinGlow.y); let rightDist = dist(rightHandX, rightHandY, perlinGlow.x, perlinGlow.y); if (leftDist < 150 || rightDist < 150) { orbGlow.targetIntensity = 2.5; orbGlow.maxSize = 2.0; orbGlow.pulseSpeed = 0.03; let closestHand = leftDist < rightDist ? { x: leftHandX, y: leftHandY } : { x: rightHandX, y: rightHandY }; perlinGlow.repelAngle = atan2(perlinGlow.y - closestHand.y, perlinGlow.x - closestHand.x); perlinGlow.repelForce = map(min(leftDist, rightDist), 0, 100, 15, 0); } else { orbGlow.targetIntensity = 1.0; orbGlow.maxSize = 1.0; orbGlow.pulseSpeed = 0.01; perlinGlow.repelForce = lerp(perlinGlow.repelForce, 0, 0.1); } } orbGlow.intensity = lerp(orbGlow.intensity, orbGlow.targetIntensity, 0.1); if (perlinGlow.opacity <= 0) return; perlinGlow.noiseOffsetX += perlinGlow.speed; perlinGlow.noiseOffsetY += perlinGlow.speed; let angle = noise(perlinGlow.noiseOffsetX) * TWO_PI * 2; let radius = noise(perlinGlow.noiseOffsetY) * 200 + 600; let targetX = width / 2 + cos(angle) * radius; let targetY = height / 2 + sin(angle) * radius; if (perlinGlow.repelForce > 0) { targetX += cos(perlinGlow.repelAngle) * perlinGlow.repelForce; targetY += sin(perlinGlow.repelAngle) * perlinGlow.repelForce; } targetX = constrain(targetX, 100, width - 100); targetY = constrain(targetY, 100, height - 100); if (perlinGlow.x === 0) { perlinGlow.x = targetX; perlinGlow.y = targetY; } let moveSpeed = perlinGlow.repelForce > 0 ? 0.02 : 0.005; perlinGlow.x = lerp(perlinGlow.x, targetX, moveSpeed); perlinGlow.y = lerp(perlinGlow.y, targetY, moveSpeed); push(); blendMode(ADD); let pulse = sin(frameCount * orbGlow.pulseSpeed) * 0.5 + 1.2; for (let i = 0; i < 12; i++) { let size = perlinGlow.size * (1.5 + i * 0.4) * pulse * orbGlow.intensity * orbGlow.maxSize; let alpha = map(i, 0, 11, 255, 0) * perlinGlow.opacity * orbGlow.intensity; noStroke(); fill(255, 200, 100, alpha); ellipse(perlinGlow.x, perlinGlow.y, size, size); } let coreSize = perlinGlow.size * 0.4 * pulse * orbGlow.intensity * orbGlow.maxSize; fill(255, 220, 150, 255 * perlinGlow.opacity * orbGlow.intensity); ellipse(perlinGlow.x, perlinGlow.y, coreSize, coreSize); fill(255, 255, 200, 255 * perlinGlow.opacity * orbGlow.intensity); ellipse(perlinGlow.x, perlinGlow.y, coreSize * 0.4, coreSize * 0.4); blendMode(BLEND); pop(); } catch (e) {} }
