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
    const conversionStore = upgradeDb.createObjectStore('conversions');
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
    this.currencies = [];
    this._dbPromise = openDatabase();
    this._registerServiceWorker();
    this._updateNetworkStatus();
    this._monitorNetwork();
    this._fetchCurrencies();
  }

  // register service worker
  _registerServiceWorker() {
    if (navigator.serviceWorker) {
      navigator.serviceWorker
        .register('/sw.js')
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
          return fetch(`${API_URL}/api/v5/currencies`).then(response => {
            resolve(response.json());
          });
        });
        promise.then(response => {
          appController.currencies = Object.keys(response.results).map(key => {
            return { name: key, details: response.results[key] };
          });
          appController._addCurrenciesToView(appController.currencies);
          appController._storeCurrenciesInIDB(appController.currencies);
        });
      } else {
        appController._dbPromise.then(db => {
          if (!db) return;

          let tx = db.transaction('currencies').objectStore('currencies');
          return tx.getAll().then(currencies => {
            appController._addCurrenciesToView(currencies);
          });
        });
      }
    } catch (error) {
      showToast('Cannot currently get any data');
    }
  }
  _fetchConversionRate() {}
  _storeCurrenciesInIDB(currencies) {
    this._dbPromise.then(function(db) {
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
  _storeConversionInIDB() {}
  _getCurrenciesFromIDB() {}
  _getConversionFromIDB() {}

  // add list of currencies to view
  _addCurrenciesToView(currencies) {
    for (let currency of currencies) {
      const option1 = document.createElement('option');
      const option2 = document.createElement('option');
      option1.text = option2.text = view.input1Label.text = view.input2Label.text =
        currency.name;
      view.currencyList1.add(option1);
      view.currencyList2.add(option2);
      this._userInteraction();
    }
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
  _userInteraction() {
    const currency1 = view.currencyList1.value;
    const currency2 = view.currencyList2.value;
  }
}

// Create application instance
const app = new ApplicationController();
