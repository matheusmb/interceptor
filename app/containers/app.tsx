import * as React from "react";
import { render } from "react-dom";
import { Provider } from "react-redux";
import { Store } from "webext-redux";
import { initialiseDefaults, updateRequest, clearFields, handleCheckToggle, handleRespTextChange } from "./../actions";

import Popup from "./Popup";

const queryParams: chrome.tabs.QueryInfo = {
  active: true,
  currentWindow: true
};

interface Request {
  enabled: boolean;
  method: string;
  tabId?: number;
  requestId: string;
  type: string;
  url: string;

}
interface StoredRequests {
  storedRequests: {
    hostname: string;
    requests: Request[];
    requestRecords: {
      [reqId: string]: {
        contentType: string;
        responseError: string;
        responseText: string;
        serverError: string;
        serverResponse: string;
        statusCode: string;
      }
    }
  }[]
};

const loadState = (): StoredRequests | undefined => {
  try {
    const serializedState = localStorage.getItem('interceptorState');

    if (serializedState === null) {
      return undefined;
    }

    return JSON.parse(serializedState);
  } catch (err) {
    return undefined;
  }
}

const saveState = (state: any) => {
  try {
    const { storedRequests } = loadState() || { storedRequests: [] };
    const { rootReducer } = state;

    const currentUrl = rootReducer.currentUrl;
    const { hostname } = new URL(currentUrl);
    const currentTab = rootReducer.tabRecord[rootReducer.currentTab];
    const { requests, checkedReqs, requestRecords } = currentTab;

    const requestsIndex = storedRequests.findIndex(it => it.hostname == hostname);

    const serializedRequests = requests.map((request: Request) => {
      delete request.tabId;
      request.enabled = checkedReqs[request.requestId] === true;
      return request;
    });

    if (serializedRequests.length == 0 && requestsIndex == -1)
      return

    if (requestsIndex > -1) {
      storedRequests[requestsIndex].requests = serializedRequests;
      storedRequests[requestsIndex].requestRecords = requestRecords;
    } else {

      storedRequests.push({
        hostname: hostname,
        requests: serializedRequests,
        requestRecords
      })
    }


    const serializedState = JSON.stringify({ storedRequests });

    localStorage.setItem('interceptorState', serializedState);
  } catch (err) {
    // Ignore
  }
}

const store = new Store({
  portName: "INTERCEPTOR"
});

chrome.tabs.query(queryParams, tabs => {
  const tab = tabs[0];
  if (!tab) return;

  const { id, url } = tab;
  if (typeof id === "undefined" || typeof url === "undefined") return;

  store.dispatch(initialiseDefaults(id, url, ""));

  const { storedRequests } = loadState() || { storedRequests: [] };
  const { hostname } = new URL(url);
  const urlRequests = storedRequests !== undefined && storedRequests.find(it => it.hostname == hostname);



  if (urlRequests) {
    store.dispatch(clearFields(id));
    urlRequests.requests.map(request => {
      store.dispatch(updateRequest(id, { ...request, tabId: id }));

      if (request.enabled) {
        store.dispatch(handleCheckToggle(id, request.requestId, true));
      }
    });

    Object.entries(urlRequests.requestRecords).map(([reqId, record]) => {
      if (record.responseText.length > 0) {
        store.dispatch(handleRespTextChange(record.responseText, reqId, id));
      }
    })
  }



  store.ready().then(() => {
    store.subscribe(() => {
      saveState(store.getState());
    });
    render(
      <Provider store={store}>
        <Popup />
      </Provider>,
      document.getElementById("root") as HTMLElement
    );
  });
});
