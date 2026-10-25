/* Voice Form Helper - toolbar icon click injects the panel into THAT tab only
   (activeTab: no standing access to other sites). */
chrome.action.onClicked.addListener(function (tab) {
    if (!tab || !tab.id) return;
    chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['parser.js', 'matcher.js', 'content.js']
    }, function () {
        if (chrome.runtime.lastError) return; // chrome:// pages etc. me inject nahi hota
        chrome.tabs.sendMessage(tab.id, { type: 'VFH_TOGGLE' });
    });
});
