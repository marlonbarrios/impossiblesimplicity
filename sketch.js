/* - - MediaPipe Body tracking - - */

// What we do in this example:
// - Use the 'B' key to toggle the background between solid black and the live webcam feed.
// - All generative art is drawn on top of the selected background.

/* - - Variables - - */

// webcam variables
let capture;
let captureEvent;

// **NEW**: State variable to control the background
let showWebcamBackground = false;

// lerping (smoothing the landmarks)
let lerpRate = 0.2;
let madeClone = false;
let lerpLandmarks;

// sound
let mic;
let audioLevel = 0;
let audioMultiplier = 5;
let micStarted = false;

// velocity tracking
let prevPoints = {};


/* - - Setup - - */
function setup() {
    createCanvas(windowWidth, windowHeight);
    captureWebcam();

    // Initialize audio input
    mic = new p5.AudioIn(() => {
        // This is a callback for when the mic is ready
    }, (err) => {
        console.error("Mic error:", err);
    });
    mic.start(() => {
        console.log("Mic started");
        micStarted = true;
    }, () => {
        console.warn("Mic failed to start. User needs to interact.");
    });

    // styling
    noStroke();
    textAlign(LEFT, CENTER);
    textSize(20);
    fill(255);
}


/* - - Draw - - */
function draw() {
    // **MODIFIED**: This block now handles switching the background
    if (showWebcamBackground) {
        // If true, draw the mirrored webcam feed as the background
        push();
        centerOurStuff();
        scale(-1, 1); // Mirror the webcam
        image(capture, -capture.scaledWidth, 0, capture.scaledWidth, capture.scaledHeight);
        pop();
    } else {
        // If false, draw a solid black background
        background(0);
    }

    /* TRACKING */
    // All the tracking and drawing logic remains and is drawn on top of the background
    if (mediaPipe.landmarks && mediaPipe.landmarks[0]) {
        push();
        centerOurStuff();

        if (!madeClone) {
            lerpLandmarks = JSON.parse(JSON.stringify(mediaPipe.landmarks));
            madeClone = true;
        }

        for (let i = 0; i < mediaPipe.landmarks[0].length; i++) {
            lerpLandmarks[0][i].x = lerp(lerpLandmarks[0][i].x, mediaPipe.landmarks[0][i].x, lerpRate);
            lerpLandmarks[0][i].y = lerp(lerpLandmarks[0][i].y, mediaPipe.landmarks[0][i].y, lerpRate);
        }

        // Map all the landmark points
        const nose = getPoint(0);
        const leftShoulder = getPoint(11);
        const rightShoulder = getPoint(12);
        const leftElbow = getPoint(13);
        const rightElbow = getPoint(14);
        const leftHand = getPoint(19);
        const rightHand = getPoint(20);
        const leftHip = getPoint(23);
        const rightHip = getPoint(24);
        const leftKnee = getPoint(25);
        const rightKnee = getPoint(26);
        const leftAnkle = getPoint(27);
        const rightAnkle = getPoint(28);

        // This is a helper function to avoid repeating the map() code
        function getPoint(index) {
            return {
                x: map(lerpLandmarks[0][index].x, 1, 0, 0, capture.scaledWidth),
                y: map(lerpLandmarks[0][index].y, 0, 1, 0, capture.scaledHeight)
            };
        }

        // Draw the elastic body figure
        drawElasticBody(nose, leftShoulder, rightShoulder, leftElbow, rightElbow, leftHand, rightHand, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle);
        
        pop(); // End of centered drawing
    }
}

// Function to draw the main body figure
function drawElasticBody(nose, leftShoulder, rightShoulder, leftElbow, rightElbow, leftHand, rightHand, leftHip, rightHip, leftKnee, rightKnee, leftAnkle, rightAnkle) {
    
    // Draw Torso
    drawElasticLine(leftShoulder.x, leftShoulder.y, rightShoulder.x, rightShoulder.y, 8, 'shoulders');
    drawElasticLine(leftShoulder.x, leftShoulder.y, leftHip.x, leftHip.y, 8, 'leftTorso');
    drawElasticLine(rightShoulder.x, rightShoulder.y, rightHip.x, rightHip.y, 8, 'rightTorso');
    drawElasticLine(rightHip.x, rightHip.y, leftHip.x, leftHip.y, 8, 'hips');

    // Draw Arms
    drawElasticLine(leftShoulder.x, leftShoulder.y, leftElbow.x, leftElbow.y, 6, 'leftUpperArm');
    drawElasticLine(leftElbow.x, leftElbow.y, leftHand.x, leftHand.y, 6, 'leftLowerArm');
    drawElasticLine(rightShoulder.x, rightShoulder.y, rightElbow.x, rightElbow.y, 6, 'rightUpperArm');
    drawElasticLine(rightElbow.x, rightElbow.y, rightHand.x, rightHand.y, 6, 'rightLowerArm');

    // Draw Legs
    drawElasticLine(leftHip.x, leftHip.y, leftKnee.x, leftKnee.y, 7, 'leftUpperLeg');
    drawElasticLine(rightHip.x, rightHip.y, rightKnee.x, rightKnee.y, 7, 'rightUpperLeg');
    drawElasticLine(leftKnee.x, leftKnee.y, leftAnkle.x, leftAnkle.y, 7, 'leftLowerLeg');
    drawElasticLine(rightKnee.x, rightKnee.y, rightAnkle.x, rightAnkle.y, 7, 'rightLowerLeg');

    // Draw Neck
    drawElasticLine((leftShoulder.x + rightShoulder.x) / 2, (leftShoulder.y + rightShoulder.y) / 2, nose.x, nose.y, 5, 'neck');
}

// Helper function for drawing elastic lines
function drawElasticLine(x1, y1, x2, y2, thickness, id) {
    let baseColor = getColorBasedOnHandPosition(); // Get dynamic color
    let motion = getVelocity(id, (x1 + x2) / 2, (y1 + y2) / 2);
    let speedMultiplier = map(motion.velocity, 0, 50, 0, 1);
    
    let dynamicColor = {
        r: baseColor.r + sin(frameCount * 0.05) * 50 * speedMultiplier,
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

    // Draw glow
    noFill();
    for (let i = thickness * 3; i > 0; i -= 2) {
        let alpha = map(i, thickness * 3, 0, 30 + (speedMultiplier * 50), 0);
        stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, alpha);
        strokeWeight(i + sin(frameCount * 0.1) * 2);
        beginShape();
        curveVertex(x1, y1);
        curveVertex(mx + perpX, my + perpY);
        curveVertex(x2, y2);
        endShape();
    }
    
    // Draw core line
    stroke(dynamicColor.r, dynamicColor.g, dynamicColor.b, 180);
    strokeWeight(thickness);
    beginShape();
    curveVertex(x1, y1);
    curveVertex(mx + perpX, my + perpY);
    curveVertex(x2, y2);
    endShape();
}

// Helper function to get dynamic color
function getColorBasedOnHandPosition() {
    if (!lerpLandmarks || !lerpLandmarks[0]) return { r: 231, g: 29, b: 54 }; // Default red
    
    // Remap points inside this function to ensure they are current
    const leftShoulder = { x: map(lerpLandmarks[0][11].x, 1, 0, 0, capture.scaledWidth), y: map(lerpLandmarks[0][11].y, 0, 1, 0, capture.scaledHeight) };
    const rightShoulder = { x: map(lerpLandmarks[0][12].x, 1, 0, 0, capture.scaledWidth), y: map(lerpLandmarks[0][12].y, 0, 1, 0, capture.scaledHeight) };
    const leftHand = { x: map(lerpLandmarks[0][19].x, 1, 0, 0, capture.scaledWidth), y: map(lerpLandmarks[0][19].y, 0, 1, 0, capture.scaledHeight) };
    const rightHand = { x: map(lerpLandmarks[0][20].x, 1, 0, 0, capture.scaledWidth), y: map(lerpLandmarks[0][20].y, 0, 1, 0, capture.scaledHeight) };
    
    let centerX = (leftShoulder.x + rightShoulder.x) / 2;
    let centerY = (leftShoulder.y + rightShoulder.y) / 2;
    
    let leftHandDist = dist(leftHand.x, leftHand.y, centerX, centerY);
    let rightHandDist = dist(rightHand.x, rightHand.y, centerX, centerY);
    let whiteTransition = constrain(map(min(leftHandDist, rightHandDist), 100, 300, 1, 0), 0, 1);
    
    let baseColor = { r: 231, g: 29, b: 54 };
    let whiteColor = { r: 253, g: 255, b: 252 };
    
    return {
        r: lerp(baseColor.r, whiteColor.r, whiteTransition),
        g: lerp(baseColor.g, whiteColor.g, whiteTransition),
        b: lerp(baseColor.b, whiteColor.b, whiteTransition)
    };
}


/* - - Utility functions - - */

function keyPressed() {
    // **MODIFIED**: 'b' key toggles the background
    if (key.toLowerCase() === 'b') {
        showWebcamBackground = !showWebcamBackground;
        console.log(`Show webcam background: ${showWebcamBackground}`);
    }
}

function getVelocity(id, x, y) {
    if (!prevPoints[id]) {
        prevPoints[id] = { x: x, y: y, vx: 0, vy: 0, lastVx: 0, lastVy: 0 };
    }
    let dx = x - prevPoints[id].x;
    let dy = y - prevPoints[id].y;
    prevPoints[id].x = x;
    prevPoints[id].y = y;
    return { velocity: sqrt(dx * dx + dy * dy), acceleration: 0 }; // Simplified
}

function captureWebcam() {
    capture = createCapture({ audio: false, video: { facingMode: "user" } },
        (e) => {
            captureEvent = e;
            capture.srcObject = e;
            setCameraDimensions(capture);
            // Ensure mediaPipe is initialized and ready in your index.html
            if (window.mediaPipe) {
                mediaPipe.predictWebcam(capture);
            }
        }
    );
    capture.elt.setAttribute("playsinline", "");
    capture.hide();
}

function setCameraDimensions(video) {
    if (!video.width || video.width <= 0) return;
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
}
