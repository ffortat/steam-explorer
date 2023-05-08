const appListURL = 'https://api.steampowered.com/ISteamApps/GetAppList/v2?origin=https:%2F%2Fstore.steampowered.com';
const appListCacheLength = 60 * 60 * 1000;
const userDataURL = 'https://store.steampowered.com/dynamicstore/userdata/';
const userDataCacheLength = 60 * 60 * 1000;
const latestAppReleased = 2403130;

let db;
let userData = {};

/**
 * URLS
 * - https://store.steampowered.com/dynamicstore/userdata/
 * - https://store.steampowered.com/api/appdetails?appids=2402430
 * - https://api.steampowered.com/ISteamApps/GetAppList/v2/
 * - https://api.steampowered.com/ISteamWebAPIUtil/GetSupportedAPIList/v1/
 * - https://api.steampowered.com/IStoreService/GetAppList/v1/?key=<key>&include_games=true&max_results=50000
 * - https://api.steampowered.com/IStoreService/GetAppList/v1/?key=<key>&include_games=true&last_appid=1513430&max_results=50000
 * - https://api.steampowered.com/IStoreService/GetAppInfo/v1/?app=10
 */

function request(url, callback) {
    fetch(url, {method: 'GET'})
        .then((response) => {
            return response.json();
        })
        .then(callback);
}
function cacheExpired(key, length) {

    if (localStorage.getItem(key) !== null) {
        let cacheTime = parseInt(localStorage.getItem(key))
        return Date.now() > cacheTime + length;
    }

    return true;
}

function loadAppList(callback) {
    if (cacheExpired('apps.cached', appListCacheLength)) {
        request(appListURL, (data) => {
            storeAppList(data, callback);
        });
    } else {
        if (callback) {
            callback();
        }
    }
}

function loadUserData(callback) {
    if (cacheExpired('userData.cached', userDataCacheLength)) {
        request(userDataURL, (data) => {
            storeUserData(data);

            if (callback) {
                callback();
            }
        });
    } else {
        retrieveUserData();

        if (callback) {
            callback();
        }
    }
}

function storeAppList(data, callback) {
    localStorage.setItem('apps.cached', Date.now());
    storeAppsInDB(data.applist.apps, callback);
}

function storeAppsInDB(appsArray, callback) {
    // console.log(userData);
    const ownedApps = userData.rgOwnedApps; // array of appids
    const ignoredApps = userData.rgIgnoredApps; // object with appid as keys
    const wishlistedApps = userData.rgWishlist; // array of appids

    const objectStore = db.transaction('apps', 'readwrite').objectStore('apps');
    objectStore.transaction.addEventListener('complete', (event) => {
        console.log('Apps up to date in database!');

        if (callback) {
            callback();
        }
    });

    console.log('Updating apps in database.');
    onAppsLoading();

    let app, appData, owned, ignored, wishlisted;

    for (var index in appsArray) {
        app = appsArray[index];
        owned = ownedApps.indexOf(app.appid) >= 0;
        ignored = ignoredApps[app.appid] !== undefined;
        wishlisted = wishlistedApps.indexOf(app.appid) >= 0;

        appData = {
            appid: appsArray[index].appid,
            name: appsArray[index].name,
            seen: owned || ignored || wishlisted ? 1 : 0,
            owned: owned,
            ignored: ignored,
            wishlisted: wishlisted
        };

        if (appData.name.lastIndexOf(' Demo') !== appData.name.length - 5 &&
            appData.name.lastIndexOf(' Playtest') !== appData.name.length - 9) {
            objectStore.add(appData);
        }
    }
}

function storeUserData(data) {
    localStorage.setItem('userData.cached', Date.now());
    localStorage.setItem('userData.stored', JSON.stringify(data));

    userData = data;
}

function retrieveUserData() {
    userData = JSON.parse(localStorage.getItem('userData.stored'));
}

function invalidateCache() {
    localStorage.setItem('apps.cached', 0);
    localStorage.setItem('userData.cached', 0);
}

function updateApps() {
    loadUserData(() => {
        loadAppList(onAppsLoaded);
    });
}

function onAppsLoading() {
    // TODO data is loading

}

function onAppsLoaded() {
    // TODO all data is loaded and ready
    const pageData = window.location.pathname.split('/').slice(1, 3);
    let currentAppid = -1;

    if (pageData.length === 2 && pageData[0] === 'app') {
        currentAppid = parseInt(pageData[1]);
        setAppAsSeen(currentAppid);
    }

    getNextAppUnseen((appid) => {
        addExploreButtonToSteamPage(appid);
    });

    getRandomAppUnseen((appid) => {
        addRandomButtonToSteamPage(appid);
    });
}

function setAppAsSeen(appid) {
    const objectStore = db.transaction('apps', 'readwrite').objectStore('apps')
    const request = objectStore.get(appid);

    request.onsuccess = (event) => {
        const data = event.target.result;

        if (data.seen === 0) {
            data.seen = 1;
            objectStore.put(data);
        }
    }
}

function getNextAppUnseen(callback) {
    const objectStore = db.transaction('apps').objectStore('apps')
    const index = objectStore.index('seen');

    index.openCursor(0, 'prev').onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor.value.appid > latestAppReleased) {
            cursor.continue();
        } else {
            console.log('Next app to see is ' + cursor.value.appid + ' - ' + cursor.value.name);
            callback(event.target.result.value.appid);
        }
    }
}

function getRandomAppUnseen(callback) {
    const objectStore = db.transaction('apps').objectStore('apps')
    const index = objectStore.index('seen');

    index.count(0).onsuccess = (event) => {
        const random = Math.floor(Math.random() * event.target.result);
        let i = 0;

        index.openCursor(0, 'prev').onsuccess = (event) => {
            const cursor = event.target.result;
            if (i < random) {
                i += 1;
                cursor.continue();
            } else {
                console.log('Random app to see is ' + cursor.value.appid + ' - ' + cursor.value.name);
                callback(event.target.result.value.appid);
            }
        };
    };
}

function addExploreButtonToSteamPage(appid) {
    const navBar = document.getElementsByClassName('store_nav')[0];
    const exploreButton = document.createElement('a');
    exploreButton.className = 'tab';
    exploreButton.href = `${window.location.origin}/app/${appid}`
    exploreButton.innerHTML = `<span>Next</span>`;

    navBar.appendChild(exploreButton);
}

function addRandomButtonToSteamPage(appid) {
    const navBar = document.getElementsByClassName('store_nav')[0];
    const exploreButton = document.createElement('a');
    exploreButton.className = 'tab';
    exploreButton.href = `${window.location.origin}/app/${appid}`
    exploreButton.innerHTML = `<span>Random</span>`;

    navBar.appendChild(exploreButton);
}

function storeInDatabase() {
    const request = indexedDB.open('SteamExplorer');
    request.onerror = (event) => console.error('Can\'t instanciate database.');
    request.onsuccess = (event) => {
        db = event.target.result;
        db.onerror = (event) => {
            const error = event.target.error;

            if (event.target.error.code === 0) {
                event.preventDefault();
                event.stopPropagation();
            } else {
                console.error(`Database error: ${error.code} - ${error.name} - ${error.message}`);
            }
        }
        console.log('Database opened!');

        updateApps();
    };
    request.onupgradeneeded = (event) => {
        db = event.target.result;
        const objectStore = db.createObjectStore('apps', {keyPath: 'appid'});
        objectStore.createIndex('name', 'name', {unique: false});
        objectStore.createIndex('seen', 'seen', {unique: false});
        objectStore.createIndex('owned', 'owned', {unique: false});
        objectStore.createIndex('ignored', 'ignored', {unique: false});
        objectStore.createIndex('wishlisted', 'wishlisted', {unique: false});
        console.log('DB open upgraded');
    }
}

// invalidateCache();
storeInDatabase();

// TODO check if app page redirected to another one => remove previous app (or mark as seen too)
