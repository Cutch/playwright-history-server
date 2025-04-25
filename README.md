## What is it?

The playwright history server allows users to collaborate, comment and view the history of playwright html reports. It is based on the playwright html report, and provides all of the same functionality except for the trace viewer and xterm features.
![Screen Shot](/screenshot/Screenshot_2024-04-03_004449.png 'Screen Shot')

## Setup

Clone the git repository  
Run `npm i` and `npm run build` in the base directory. Note the file `summary-html.js` will be built to the main directory and is the reporter used for playwright.

If you want to make any changes to the react code base just run `npm run build` and the changes will be built and served by the server.

### With Docker (Recommended)

Install docker and docker-compose  
The server can be started by running `npm run start` which will run the docker-compose  
By default the server will be running on port 8080  
ex.  
[http://localhost:8080/](http://localhost:8080/)  
You can now move on to loading a run

### Without docker

Install node, postgres  
Change the [./server/config.js](server/config.js) file to match the postgres connection details  
Start the server by running node on [./server/server.js](server/server.js)  
You can now move on to loading a run

## Load a playwright run

The file `summary-html.js` will be built to the main directory copy it to your playwright test suite.  
You can use it with merge reports ex.  
`ENVIRONMENT=prod API=http://localhost:8080 npx playwright merge-reports --reporter ./summary-html.js ./blob-reports`  
Or plug it directly into your playwright config

```js
export default defineConfig({
  reporter: [[`./summary-html.js`, { environment: 'prod', api: 'http://localhost:8080' }]],
});
```

Playwright reports and assets will automatically be sent to the playwright history server, stored, and served by it.

## Notes

Currently assets will not be cleared from the server automatically so ensure that they are either periodically cleaned up or there is enough space.

The history displayed in the charts are limited by one month however, and any resolved comments older then a month will not show. Unresolved comments older than one month will stay until resolved, but will no longer align with the run in the graph (run can still be access by clicking on the comment icon).
