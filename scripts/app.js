class HumbleObject
{
    constructor(value, func)
    {
        this._value = value;
        this.func = func;
    }

    get value()
    {
        return this._value;
    }

    set value(newValue)
    {
        this._value = newValue;
        if (typeof this.func === 'function')
            this.func(newValue);
    }

    /** Set value without invoking func */
    setSilent(newValue)
    {
        this._value = newValue;
    }

    /** Forcefully invokes func */
    refresh()
    {
        this.value = this.value;
    }
}

class Timer
{
    constructor(callback, interval, loop = false)
    {
        this.callback = callback;
        this.interval = interval;
        this.loop = loop;
        this.timerId = null;
        this.paused = true;
        this.remainingTime = interval;
    }

    start()
    {
        this.paused = false;
        this.startTime = Date.now();
        this.timerId = setTimeout(() => this.executeCallback(), this.remainingTime);
    }

    pause()
    {
        if (!this.paused)
        {
            clearTimeout(this.timerId);
            this.paused = true;
            this.remainingTime -= Date.now() - this.startTime;
        }
    }

    resume()
    {
        if (this.paused)
        {
            this.paused = false;
            this.startTime = Date.now();
            this.timerId = setTimeout(() => this.executeCallback(), this.remainingTime);
        }
    }

    executeCallback()
    {
        this.callback();
        if (this.loop && !this.paused)
        {
            this.remainingTime = this.interval;
            this.start();
        } else
        {
            this.paused = true;
        }
    }
}

const imageViewer = document.getElementById('image-viewer');
const thumbnailsContainer = document.getElementById('thumbnails');
const thumbnails = document.querySelectorAll('#thumbnails img');
const currentImage = document.getElementById('current-image');
const currentImageURL = document.getElementById('current-image-url');
const currentImageText = document.getElementById('current-image-text');
const currentImageInnerTitle = currentImageURL.querySelector('h1');
const currentImageInnerURL = currentImageURL.querySelector('h2');
const credits = document.getElementById('credits');
const muteIndicator = document.getElementById('mute-indicator');
const audioElements = document.querySelectorAll('audio');

document.addEventListener('keydown', event => handleKeyDown(event));

let selectedThumbnailIndex = 0;

let transitionCache = thumbnailsContainer.style.transition;
thumbnailsContainer.style.transition = 'none';
updateSelectedImage();
requestAnimationFrame(() => thumbnailsContainer.style.transition = transitionCache); //TODO: in the end, this may not be displayed from the page's initial load anyway, so it may not need this frame delay work-a-round

thumbnails.forEach((thumbnail) =>
{
    thumbnail.addEventListener('click', () =>
    {
        selectThumbnail(Array.from(thumbnails).indexOf(thumbnail));
    });
});

let gameStarting = false;
let gameStarted = false;

/** @typedef {Object.<string, HTMLAudioElement>} AudioObject */

/** Object containing all sound effects by their associated ID substring.
 *  @type {AudioObject} */
const soundEffects = {};
/** @type {HTMLAudioElement} */
let currentBGM;

document.querySelectorAll('audio').forEach(audioElement =>
{
    let volume = audioElement.dataset.volume;
    if (volume)
        audioElement.volume = volume;

    soundEffects[audioElement.id.substring('audio-'.length)] = audioElement;

    if (audioElement.autoplay)
        currentBGM = audioElement;
});

const cachedImages = [];

/** @typedef {Object.<string, Array<string>>} AnimationFrameCollection */

/** @type {AnimationFrameCollection} */
const animationFrameCollection = {
    player_jump: createAnimationFrameList('images/game/jump/', 8),
    player_attack: createAnimationFrameList('images/game/attack/', 5, 4),
}

//TODO: SOUND TESTING
let currentSoundIndex = 0;
const soundList = [
    'カーソル移動6.mp3',
    'カーソル移動8.mp3',
    'カーソル移動9.mp3',
    'カーソル移動12.mp3',
    '決定ボタンを押す7.mp3',
    '決定ボタンを押す22.mp3',
    '決定ボタンを押す32.mp3',
    '決定ボタンを押す40.mp3',
    '決定ボタンを押す44.mp3',
    '決定ボタンを押す50.mp3',
    '剣の素振り1.mp3',
    '受話器を取る.mp3',
    '打撃1.mp3',
    '拳銃を撃つ.mp3',
    '携帯電話をたたむ.mp3',
    '拳銃を弾き飛ばされる.mp3',
    '拳銃を落とす.mp3',
    '打撃6.mp3',
    '建物が少し崩れる2.mp3',
    '石が砕ける.mp3',
    '重いパンチ3.mp3'
]

const LOCALSTORAGE_isMuted = 'isMuted';
let isMuted = new HumbleObject(getLocalStorage(LOCALSTORAGE_isMuted, false), muted => setLocalStorage(LOCALSTORAGE_isMuted, muted));

// Convert localStorage value (string) to boolean
if (isMuted.value === 'true' || isMuted.value === true)
    isMuted.setSilent(true);
else
    isMuted.setSilent(false);

// Hack:
// Because of 'strict' autoplay policies, the HTML 'autoplay' tag is allowed
// but playing audio through script that that isn't 'user interaction' is blocked, so:
// - if audio should be playing, we do nothing and rely on the HTML tag
// - if audio should be muted, we try to play media elements, which is not allowed
// and therefore (for some reason) mutes the media elements instead
if (isMuted.value)
    setMute(isMuted.value, false);

// To further make sure BGM is autoplayed (on first user interaction)
document.addEventListener('mousedown', playMainBGMOnUserInteraction, { once: true });
document.addEventListener('keydown', playMainBGMOnUserInteraction, { once: true });
document.addEventListener('touchstart', playMainBGMOnUserInteraction, { once: true });
function playMainBGMOnUserInteraction()
{
    if (soundEffects['bgm-main'].paused)
        playSoundEffect('bgm-main');
}

muteIndicator.addEventListener('animationend', () =>
{
    muteIndicator.classList.remove('mute-indicator-popup');
});

let isPowered = true;
imageViewer.addEventListener('transitionend', () =>
{
    imageViewer.style.display = isPowered ? '' : 'none';
});

const body = document.querySelector('body');
document.addEventListener('mousemove', function (event)
{
    // Get the center coordinates of the page/viewport
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const shortestCenter = Math.min(centerX, centerY);

    // Calculate the distance between the mouse position and the center
    const distanceX = event.clientX - centerX;
    const distanceY = event.clientY - centerY;

    // Calculate the normalized values (-1 to 1 for shorter length, between -1 and 1 for larger length)
    const normalizedX = distanceX / (centerX * centerX / shortestCenter);
    const normalizedY = distanceY / (centerY * centerY / shortestCenter);

    // Set the background-position property based on the normalized values
    body.style.backgroundPosition = `calc(50% - ${normalizedX}rem) calc(50% - ${normalizedY}rem)`;
});

document.querySelectorAll('[data-shortcode]').forEach(function (element)
{
    element.addEventListener('click', function ()
    {
        handleGamepadInput(element.dataset.shortcode);
    });
});

function distanceLimited(dx, dy, maxDistance)
{
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < maxDistance)
    {
        return { limitedDx: dx, limitedDy: dy };
    } else
    {
        const ratio = maxDistance / distance;
        return { limitedDx: dx * ratio, limitedDy: dy * ratio };
    }
}

/** @param {KeyboardEvent} event */
function handleKeyDown(event)
{
    switch (event.key)
    {
        case 'w':
        case 'ArrowUp':
            handleGamepadInput('up', true);
            break;
        case 'd':
        case 'ArrowRight':
            handleGamepadInput('right', true);
            break;
        case 's':
        case 'ArrowDown':
            handleGamepadInput('down', true);
            break;
        case 'a':
        case 'ArrowLeft':
            handleGamepadInput('left', true);
            break;

        case 'z':
        case 'q':
        case 'Space':
            handleGamepadInput('b', true);
            break;
        case 'x':
        case 'e':
        case 'c':
            handleGamepadInput('c', true);
            break;

        case 'm':
            handleGamepadInput('mute', true);
            break;

        case 'Escape':
            handleGamepadInput('start', true);
            break;

        case 'p':
            if (confirm('Delete save data?'))
                clearLocalStorage();
            break;
    }
}

function handleGamepadInput(shortcode, virtual = false)
{
    if (!virtual)
        playSoundEffect('click');

    if (!isPowered && (shortcode != 'power' && shortcode != 'mute'))
        return;

    clickedElements.push(shortcode);
    if (clickedElements.length > sequence.length)
        clickedElements.shift();

    checkSequence();

    switch (shortcode)
    {
        // left cardinals (d-pad)
        case 'up':
            // select first
            selectThumbnail(0);
            break;
        case 'right':
            // select next (right)
            selectThumbnail(clamp(selectedThumbnailIndex + 1, 0, thumbnails.length - 1));
            break;
        case 'down':
            // select last
            selectThumbnail(thumbnails.length - 1);
            break;
        case 'left':
            // select previous (left)
            selectThumbnail(clamp(selectedThumbnailIndex - 1, 0, thumbnails.length - 1));
            break;
        // right cardinals
        case 'd':
            // show info
            if (currentImage.classList.contains('current-image-hovered'))
            {
                currentImage.classList.remove('current-image-hovered');
                currentImageText.classList.remove('current-image-text-hovered');
            }
            else
            {
                currentImage.classList.add('current-image-hovered');
                currentImageText.classList.add('current-image-text-hovered');
            }
            break;
        case 'a':
            setPaused(true);
            currentImageInnerURL.click();
            break;
        case 'b':
            if (gameStarted)
                jump();
            else if (!gameStarting)
                startGame();
            break;
        case 'c':
            if (gameStarted)
                attack();
            break;
        // top
        case 'start':
            setPaused(!paused);
            break;
        case 'select':
            if (selectButton.classList.contains('konami'))
            {
                setKonamiMode(true);
                setPaused(false);

                setTimeout(() => setKonamiMode(false), 10000)
            }
            selectButton.classList.remove('konami');
            selectButton.style.removeProperty('background-color');
            break;
        case 'power':
            playSoundEffect(isPowered ? 'power-off' : 'power-on');
            togglePower();
            break;
        case 'mute':
            toggleMute();
            break;

        default:
            console.error('Unknown Shortcode: ' + shortcode);
            break;
    }
}

/** @param {boolean} active */
function setKonamiMode(active)
{
    if (active)
    {
        playerCharacter.classList.add('konami');
        playerCharacterKonami.classList.remove('display-none');
        transitionBGM(soundEffects['bgm-konami']);
    }
    else
    {
        playerCharacter.classList.remove('konami');
        playerCharacterKonami.classList.add('display-none');
        transitionBGM(soundEffects['bgm-game']);
    }
}

/** @param {number} index */
function selectThumbnail(index)
{
    thumbnails[selectedThumbnailIndex].classList.remove('thumbnail-selected');
    selectedThumbnailIndex = index;

    updateSelectedImage();

    playSoundEffect('move-selection');
}

function updateSelectedImage()
{
    thumbnails[selectedThumbnailIndex].classList.add('thumbnail-selected');

    // set properties of current image to thumbnail image
    currentImage.src = thumbnails[selectedThumbnailIndex].src;
    currentImage.alt = currentImageInnerTitle.innerText = thumbnails[selectedThumbnailIndex].alt;

    // set url of current image anchor
    let url = thumbnails[selectedThumbnailIndex].dataset.url;
    if (url === undefined)
    {
        currentImageURL.removeAttribute('href');
        currentImageInnerURL.innerText = '';
    }
    else
        currentImageURL.href = currentImageInnerURL.innerText = url;

    if (thumbnails[selectedThumbnailIndex].id === 'credits-thumbnail')
        credits.classList.remove('display-none');
    else
        credits.classList.add('display-none');

    // center thumbnails container on selected thumbnail
    let elementAsPercentage = convertPixelsToPercentage(thumbnails[selectedThumbnailIndex])
    let translateAmount = elementAsPercentage.left + (elementAsPercentage.width / 2);
    thumbnailsContainer.style.transform = `translateX(-${translateAmount}%)`;
}

function clamp(number, min, max)
{
    return Math.min(Math.max(number, min), max);
}

/** @param {Element} element */
function convertPixelsToPercentage(element)
{
    var parentWidth = element.parentNode.offsetWidth;
    var offsetLeft = element.offsetLeft;
    var offsetWidth = element.offsetWidth;

    var percentageLeft = (offsetLeft / parentWidth) * 100;
    var percentageWidth = (offsetWidth / parentWidth) * 100;

    return {
        left: percentageLeft,
        width: percentageWidth
    };
}

/** @param {string} name ID substring */
function playSoundEffect(name)
{
    soundEffects[name].currentTime = 0;
    soundEffects[name].play();
}

// Fade out the current BGM and fade in the specified BGM
/** @param {HTMLAudioElement} targetBGM */
function transitionBGM(targetBGM, interval = 1000, steps = 60)
{
    if (!currentBGM || !targetBGM)
    {
        console.error('Invalid BGM elements');
        return;
    }

    let progress = 0;
    const step = interval / steps;

    targetBGM.volume = 0;
    targetBGM.play();

    const transitionTimer = new Timer(() =>
    {
        progress += step;
        targetBGM.volume = targetBGM.dataset.volume * (progress / interval);
        currentBGM.volume = currentBGM.dataset.volume * ((interval - progress) / interval);

        if (progress >= interval - 0.001) // Accounting for floating-point error
        {
            transitionTimer.loop = false;
            currentBGM.pause();
            currentBGM = targetBGM;
        }
    }, step, true);

    transitionTimer.start();
}

function setMute(muted, updateLocalStorage = true)
{
    if (updateLocalStorage)
        isMuted.value = muted;

    audioElements.forEach(audio => audio.muted = muted);

    muteIndicator.src = muted ? muteIndicator.dataset.muteImageUrl : muteIndicator.dataset.unmuteImageUrl;

    muteIndicator.classList.remove('mute-indicator-popup');
    setTimeout(() => muteIndicator.classList.add('mute-indicator-popup'), 10);
}

function toggleMute()
{
    setMute(!isMuted.value);
}

function togglePower()
{
    isPowered = !isPowered;

    if (isPowered)
    {
        imageViewer.style.display = '';
        setTimeout(() => imageViewer.classList.remove('power-off'), 10);
    }
    else
        imageViewer.classList.add('power-off');
}

// GAME ---------------------------------------------------------------------------

const game = document.getElementById('game');
const playerCharacter = document.getElementById('player-character');
const playerCharacterHitbox = document.getElementById('player-character-hitbox');
const playerCharacterKonami = document.getElementById('player-character-konami');
const scoreElement = document.getElementById('score');
const sessionScoreElement = document.getElementById('session-score');
const highScoreElement = document.getElementById('high-score');
const pauseScreen = document.getElementById('pause-screen');
const pauseScreenHint = document.getElementById('pause-screen-hint');

const obstacles = {};
let obstacleIdCounter = 0;

let jumping = false;
let attacking = false;

let attackHitboxActive = false;

const LOCALSTORAGE_highScore = 'highScore';
let highScore = new HumbleObject(getLocalStorage(LOCALSTORAGE_highScore, 0), updateHighScore);
highScore.refresh();

let score = new HumbleObject(0, updateScore);
score.refresh();

let paused = false;
let pauseHintIndex = -1;
const pauseHints = [
    'Take your time...',
    'Did you know...',
    'Oh, fancy seeing you here!',
    'Had enough?',
    'There are keyboard controls, you know...',
    'Jump: z, q, space\nAttack: x, e, c\nUltimate Attack: alt+f4',
    'Drink water.',
    'Eat food.',
    'Consume dihydrogen monoxide.',
    'Your high-score is... how do I say this...',
    'You were so close...',
    "PAUSED?",
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'Classic...',
    "Lock in. Lock in. Get it twisted, if you lock in you can do anything.",
    "Get it twisted, your actions impact nothing, your fate is predetermined, the only thing that you can change is your reaction to it.",
    "You can do anything you set your mind to, the world is a playground designed for YOU and only YOU to achieve your highest level ambitions. ",
    "If you wait 90 minutes to wake up until you drink your first cup of coffee, nothing can stop you. ",
    "If you duct tape your mouth when you fall asleep, nothing can stop you. GET IT TWISTED.",
    "YOU ARE A PAWN IN A UNIVERSE CHESS MATCH. YOU MEAN NOTHING TO GOD (IF THEY EVEN EXIST). ",
    "YOU'RE A ROUNDING ERROR.",
    "YOU ARE TWO PENNIES ON A FORTUNE 500 COMPANY'S BALANCE SHEET, THEY DON'T CARE ABOUT YOU IN THE SLIGHTEST. GET IT TWISTED.",
    "EVERYBODY GETS WHAT THEY DESERVE IN THIS LIFE, IF YOU PUT IN EFFORT, YOU CAN ACHIEVE ANYTHING. SUCCESSFUL PEOPLE ARE BETTER PEOPLE. GET IT TWISTED.",
    "THE CIRCUMSTANCES SURROUNDING YOUR BIRTH DETERMINE WHERE YOU ARE GOING TO GO, NOTHING ELSE MATTERS AT ALL.",
    "YOUR OWN LEVEL OF EDUCATION, YOUR ATTITUDE, YOUR LEVEL OF EFFORT, YOUR FRIENDS, YOUR NETWORK, YOUR BUSINESS, YOUR CREDENTIALS.",
    "*ahem*",
    'Remember Konami? Haha, good times...',
]

const obstacleSpawnLoop = new Timer(spawnRandomObstacle, 1000, true);

const selectButton = document.getElementById('select-button');
const sequence = ["up", "up", "down", "down", "left", "right", "left", "right", "b", "a"];
const clickedElements = [];
let rainbowHue = 0;

playerCharacter.addEventListener('animationend', animationEvent =>
{
    switch (animationEvent.animationName)
    {
        case 'first-jump':
            playerCharacter.classList.remove('first-jump');
            setPaused(false);
            gameStarted = true;
            break;
        case 'jump':
            endJump();
            break;
    }
});

if (document.visibilityState)
{
    document.addEventListener('visibilitychange', () =>
    {
        if (document.visibilityState === 'hidden' && !paused)
            setPaused(true);
    });
}

function startGame()
{
    gameStarting = true;
    game.classList.remove('game-hidden');
    playerCharacter.classList.remove('pause');
    body.classList.add('dim-background');

    playAnimation(playerCharacter, animationFrameCollection['player_jump'], 1000);

    document.querySelectorAll('.info-panel-hidden').forEach(element =>
    {
        element.classList.remove('info-panel-hidden');
    })

    transitionBGM(soundEffects['bgm-game']);
}

/** Main game loop. Called every animation frame. */
function update()
{
    for (var id in obstacles)
    {
        if (obstacles.hasOwnProperty(id) && elementsOverlap(playerCharacterHitbox, obstacles[id].element))
            handlePlayerCollision(obstacles[id], playerCharacter.classList.contains('konami'));
    }

    copyPositionAndSize(playerCharacterKonami, playerCharacter)

    rainbow(selectButton);

    requestAnimationFrame(update);
}

function setPaused(pauseState, silent)
{
    if (game.classList.contains('game-hidden') && !pauseState)
        return;

    paused = pauseState;

    if (!silent)
        playSoundEffect('pause');

    if (pauseState)
    {
        if (gameStarted)
            pauseScreen.classList.remove('display-none');

        //pauseScreenHint.innerText = pauseHints[Math.floor(Math.random() * pauseHints.length)];
        pauseScreenHint.innerText = pauseHints[pauseHintIndex];
        pauseHintIndex++;
        if (pauseHintIndex >= pauseHints.length)
            pauseHintIndex = 0;

        obstacleSpawnLoop.pause();
        for (var i = 0; i < game.children.length; i++)
        {
            game.children[i].classList.add('pause');
        }
    }
    else
    {
        pauseScreen.classList.add('display-none');
        obstacleSpawnLoop.resume();
        for (var i = 0; i < game.children.length; i++)
        {
            game.children[i].classList.remove('pause');
        }
    }
}

/** Returns true if 2 elements are overlapping in the viewport.
 * @param {Element} element1 @param {Element} element2 */
function elementsOverlap(element1, element2)
{
    const rect1 = element1.getBoundingClientRect();
    const rect2 = element2.getBoundingClientRect();

    return (
        rect1.left < rect2.right &&
        rect1.right > rect2.left &&
        rect1.top < rect2.bottom &&
        rect1.bottom > rect2.top
    );
}

function jump()
{
    if (jumping || attacking)
        return;

    jumping = true;
    playerCharacter.classList.add('jump');
    playAnimation(playerCharacter, animationFrameCollection['player_jump'], 1000);
    playSoundEffect('jump');
    score.value += 1;
}

function endJump()
{
    playerCharacter.classList.remove('jump');
    jumping = false;
}

function attack()
{
    if (jumping || attacking)
        return;

    attacking = true;
    playerCharacter.classList.add('attack');
    playAnimation(playerCharacter, animationFrameCollection['player_attack'], 500, endAttack);
    playSoundEffect('attack');

    activateAttackHitbox();
}

function activateAttackHitbox()
{
    attackHitboxActive = true
    setTimeout(() => { attackHitboxActive = false; }, 500);
}

function endAttack()
{
    playerCharacter.classList.remove('attack');
    attacking = false;
}

function handlePlayerCollision(target, konami)
{
    if ((attackHitboxActive || konami) && target.enemy)
    {
        killEnemy();
    }
    else if (!target.enemy)
    {
        if (konami)
            return;

        killProjectile();
    }
    else
    {
        kill();
    }

    target.element.remove();
    delete target;
}

function killEnemy()
{
    playSoundEffect('enemy-death');
    score.value += 1;
}

function killProjectile()
{
    playSoundEffect('projectile-death');
    score.value = 0;
}

function kill()
{
    playSoundEffect('death');
    score.value = 0;
}

function updateScore(newValue)
{
    scoreElement.innerText = newValue;

    if (newValue > sessionScoreElement.innerText)
        sessionScoreElement.innerText = newValue;

    if (newValue > highScore.value)
        highScore.value = newValue
}

function updateHighScore(newValue)
{
    highScoreElement.innerText = newValue;

    const existingHighScore = getLocalStorage(LOCALSTORAGE_highScore);

    if (!existingHighScore || newValue > parseInt(existingHighScore))
        setLocalStorage(LOCALSTORAGE_highScore, newValue);
}

/** @param {string} key */
function getLocalStorage(key, defaultValue = null)
{
    if (typeof localStorage !== 'undefined')
    {
        const value = localStorage.getItem(key);

        if (value)
            return value;
    }
    else
        console.log('localStorage is not supported in this browser.');

    return defaultValue;
}

/** @param {string} key */
function setLocalStorage(key, value)
{
    if (typeof localStorage !== 'undefined')
        localStorage.setItem(key, value);
    else
        console.log('localStorage is not supported in this browser.');
}

function clearLocalStorage()
{
    isMuted.value = false;
    highScore.value = score.value;
    sessionScoreElement.innerText = score.value;

    if (typeof localStorage !== 'undefined')
        localStorage.clear();
    else
        console.log('localStorage is not supported in this browser.');
}

function spawnRandomObstacle()
{
    let obstacle = document.createElement('div');

    if (Math.random() < 0.5)
        obstacle.className = 'enemy enemy-move';
    else
        obstacle.className = 'projectile projectile-move';

    let obstacleId = 'obstacle-' + obstacleIdCounter;
    obstacle.id = obstacleId;
    obstacleIdCounter++;

    game.appendChild(obstacle);

    obstaclePair = {
        id: obstacleId,
        element: obstacle,
        enemy: obstacle.classList.contains('enemy')
    }
    obstacles[obstacleId] = obstaclePair;

    obstacle.addEventListener('animationend', animationEvent =>
    {
        if (animationEvent.animationName.includes('move') && obstacles.hasOwnProperty(obstacleId))
        {
            obstacles[obstacleId].element.remove();
            delete obstacles[obstacleId];
        }
    });
}

function checkSequence()
{
    if (clickedElements.toString() === sequence.toString())
    {
        selectButton.classList.add('konami');
        transitionBGM(soundEffects['bgm-konami-ready']);
    }
}

/** @param {HTMLElement} self @param {HTMLElement} other */
function copyPositionAndSize(self, other)
{
    const rect = other.getBoundingClientRect();

    self.style.top = `${rect.top + window.scrollY}px`;
    self.style.left = `${rect.left + window.scrollX}px`;
    self.style.width = `${rect.width}px`;
    self.style.height = `${rect.height}px`;
}

function rainbow(element)
{
    if (element.classList.contains('konami'))
    {
        element.style.backgroundColor = `hsl(${rainbowHue}deg, 100%, 70%)`;
        rainbowHue = (rainbowHue + 3) % 360;
    }
}

/** @param {string} path @param {number} count @param {number} firstIndex */
function createAnimationFrameList(path, count, firstIndex = 1)
{
    animationFrameList = [];

    for (var i = firstIndex; i < firstIndex + count; i++)
    {
        let filePath = `${path}${i}.png`;
        animationFrameList.push(filePath);

        let cacheTarget = new Image();
        cacheTarget.src = filePath;
        cachedImages.push(cacheTarget);
    }

    return animationFrameList;
}

/** @param {HTMLElement} animationElement @param {Array<string>} imageList @param {number} animationDuration @param {function} onComplete */
function playAnimation(animationElement, imageList, animationDuration, onComplete)
{
    const imageInterval = animationDuration / imageList.length;
    let currentIndex = 0;

    function changeImage()
    {
        if (!animationElement)
        {
            if (onComplete && typeof onComplete === 'function')
                onComplete();

            return;
        }

        if (currentIndex >= imageList.length)
        {
            animationElement.style.backgroundImage = "";
            if (onComplete && typeof onComplete === 'function')
                onComplete();

            return;
        }

        animationElement.style.backgroundImage = `url(${imageList[currentIndex]})`;

        currentIndex++;

        setTimeout(changeImage, imageInterval);
    }

    changeImage();
}

update();
obstacleSpawnLoop.start();
setPaused(true, true);