const API_URL = 'https://free.currencyconverterapi.com';
let view = {
  offlineIndicator: document.querySelector('#offline'),
  onlineIndicator: document.querySelector('#online'),
  currencyList1: document.querySelector('#currencyList1'),
  currencyList2: document.querySelector('#currencyList2'),
  input1: document.querySelector('#input1'),
  input2: document.querySelector('#input2'),
  input1Label: document.querySelector('#input1Label'),
  input2Label: document.querySelector('#input2Label'),
  label1: document.querySelector('#label1'),
  label2: document.querySelector('#label2'),
  snackbar: document.querySelector('#snackbar'),
  snackbarText: document.querySelector('#snackbar-text'),
};

const openDatabase = () => {
  // If the browser doesn't support service worker,
  // we don't care about having a database
  if (!navigator.serviceWorker) {
    return Promise.resolve();
  }

  return idb.open('currency-converter', 1, upgradeDb => {
    const currencyStore = upgradeDb.createObjectStore('currencies', {
      keyPath: 'name',
    });
    const conversionStore = upgradeDb.createObjectStore('conversions', {
      keyPath: 'id',
    });
  });
};

const showToast = message => {
  view.snackbarText.textContent = message;
  view.snackbar.classList.add('show');
};

const closeToast = () => {
  view.snackbar.classList.remove('show');
};

class ApplicationController {
  constructor() {
    this.currencies = new Array();
    this.inputTrigger = 'input1';
    this._dbPromise = openDatabase();
    this._registerServiceWorker();
    this._updateNetworkStatus();
    this._monitorNetwork();
    this._fetchCurrencies();
  }

  // register service worker
  _registerServiceWorker() {
    let sw = '/sw.js';

    // fix for github pages hosting
    if (window.location.hostname === 'johnayeni.github.io')
      sw = '/alc-currency-converter/sw.js';

    if (navigator.serviceWorker) {
      navigator.serviceWorker
        .register(sw)
        .then(() => {
          console.log('Service worker registered');
        })
        .catch(e => {
          console.log('Service worker registertion failed');
        });
    }
  }

  // get list of currencies from API
  _fetchCurrencies() {
    const appController = this;
    try {
      if (navigator.onLine) {
        let promise = new Promise((resolve, reject) => {
          return fetch(`${API_URL}/api/v5/countries`).then(response => {
            resolve(response.json());
          });
        });
        promise.then(response => {
          appController.currencies = Object.keys(response.results).map(key => {
            return {
              name: response.results[key].currencyId,
              details: response.results[key],
            };
          });
          appController._addCurrenciesToView(appController.currencies);
          appController._storeCurrenciesInIDB(appController.currencies);
          appController._fetchConversionRate();
        });
      } else {
        appController._getCurrenciesFromIDB();
      }
    } catch (error) {
      showToast('Cannot currently get any data');
    }
  }

  // get conversion rate from API
  async _fetchConversionRate() {
    const appController = this;
    const currency1 = view.currencyList1.value.split('-')[0];
    const currency2 = view.currencyList2.value.split('-')[0];
    const query = `${currency1.toUpperCase()}_${currency2.toUpperCase()}`;
    let conversion = await appController._getConversionFromIDB(query);
    if (!conversion) {
      let promise = new Promise((resolve, reject) => {
        try {
          return fetch(`${API_URL}/api/v5/convert?q=${query}`).then(response =>
            resolve(response.json()),
          );
        } catch (error) {
          showToast('Could not perfrom conversion');
        }
      });
      promise.then(response => {
        appController._storeConversionInIDB(response.results[query]);
        conversion = response.results[query];
        appController._applyConversionRate(conversion.val, query);
      });
    } else {
      appController._applyConversionRate(conversion.val, query);
    }
  }

  // store list of currencies on IDB
  _storeCurrenciesInIDB(currencies) {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      let tx = db.transaction('currencies', 'readwrite');
      let store = tx.objectStore('currencies');
      // remove all previously stored currencies
      store.openCursor(null).then(function deleteRest(cursor) {
        if (!cursor) return;
        cursor.delete();
        return cursor.continue().then(deleteRest);
      });
      currencies.forEach(currency => {
        store.put(currency);
      });
    });
  }

  // store a conversion rate on IDB
  _storeConversionInIDB(conversion) {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      let tx = db.transaction('conversions', 'readwrite');
      let store = tx.objectStore('conversions');
      store.put(conversion);
    });
  }

  // get list of currecies from IDB
  _getConversionFromIDB(query) {
    const appController = this;
    return new Promise((resolve, reject) => {
      return appController._dbPromise.then(db => {
        if (!db) return;

        let tx = db.transaction('conversions').objectStore('conversions');
        return tx.get(query).then(obj => resolve(obj));
      });
    }).then(response => response);
  }

  // get a conversion rate from IDB
  _getCurrenciesFromIDB() {
    const appController = this;
    appController._dbPromise.then(db => {
      if (!db) return;

      let tx = db.transaction('currencies').objectStore('currencies');
      return tx.getAll().then(currencies => {
        appController.currencies = [...currencies];
        appController._addCurrenciesToView(currencies);
        appController._fetchConversionRate();
      });
    });
  }

  // add list of currencies to view
  _addCurrenciesToView(currencies) {
    const appController = this;
    for (let currency of currencies) {
      const option1 = document.createElement('option');
      option1.text = view.input1Label.text = `${currency.name}-${
        appController.currencies.filter(obj => obj.name == currency.name)[0]
          .details.currencyName
      }`;
      view.currencyList1.add(option1);
    }
    for (let currency of currencies.reverse()) {
      const option2 = document.createElement('option');
      option2.text = view.input2Label.text = `${currency.name}-${
        appController.currencies.filter(obj => obj.name == currency.name)[0]
          .details.currencyName
      }`;
      view.currencyList2.add(option2);
    }
    appController._userInteraction();
  }

  // apply conversion rate to inputs
  _applyConversionRate(rate, query) {
    const appController = this;
    appController._changeConvesrionDecription(rate, query);
    if (appController.inputTrigger == 'input1') {
      view.input2.value = Number(view.input1.value) * Number(rate);
    } else if (appController.inputTrigger == 'input2') {
      view.input1.value = Number(view.input2.value) / Number(rate);
    }
  }

  // Change the conversion decsription be displayed
  _changeConvesrionDecription(rate, query) {
    const appController = this;
    const currency1 = query.split('_')[0];
    const currency2 = query.split('_')[1];
    view.input1Label.textContent = currency1;
    view.input2Label.textContent = currency2;
    view.label1.textContent = `1 ${
      appController.currencies.filter(obj => obj.name == currency1)[0].details
        .currencyName
    } is equal to`;
    view.label2.textContent = `${rate} ${
      appController.currencies.filter(obj => obj.name == currency2)[0].details
        .currencyName
    }`;
  }
  // monitor network status
  _monitorNetwork() {
    window.addEventListener('online', this._updateNetworkStatus);
    window.addEventListener('offline', this._updateNetworkStatus);
  }

  // update network status
  _updateNetworkStatus() {
    const appController = this;
    if (navigator.onLine) {
      closeToast();
      showToast('Online Mode');
      view.offlineIndicator.classList.add('hide');
      view.offlineIndicator.classList.remove('show');
      view.onlineIndicator.classList.remove('hide');
      view.onlineIndicator.classList.add('show');
    } else {
      closeToast();
      showToast('Offline Mode');
      view.onlineIndicator.classList.add('hide');
      view.onlineIndicator.classList.remove('show');
      view.offlineIndicator.classList.remove('hide');
      view.offlineIndicator.classList.add('show');
    }
  }

  _userInteraction(inputTrigger = 'input1') {
    const appController = this;
    appController.inputTrigger = inputTrigger;
    appController._fetchConversionRate();
  }
}

// Create application instance
const app = new ApplicationController();
