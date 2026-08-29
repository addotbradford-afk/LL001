// ==========================================
// LINE LOGIC RECORDED FLIGHT PLAYER
// ==========================================

function trimTrackAfterLanding(track) {

  const touchdownIndex =
    track.findIndex(
      (point, pointIndex) =>
        pointIndex > 0 &&
        point.altitude <= 0 &&
        track[pointIndex - 1].altitude > 0
    );

  if (touchdownIndex < 0) {
    return track;
  }

  const rolloutEndIndex =
    track.findIndex(
      (point, pointIndex) =>
        pointIndex >= touchdownIndex &&
        point.altitude <= 0 &&
        point.speed <= 30
    );

  const finalPointIndex =
    rolloutEndIndex >= 0 ?
      rolloutEndIndex :
      touchdownIndex;

  return track.slice(
    0,
    finalPointIndex + 1
  );
}


const flightTrack = trimTrackAfterLanding(
  scenario.track.map(point => ({
    timestamp: point[0],
    position: [point[1], point[2]],
    altitude: point[3],
    speed: point[4],
    direction: point[5]
  }))
);

const routeCoordinates = flightTrack.map(
  point => point.position
);

const recordedSecondFlightTrack =
  trimTrackAfterLanding(
    secondFlight.track.map(point => ({
      timestamp: point[0],
      position: [point[1], point[2]],
      altitude: point[3],
      speed: point[4],
      direction: point[5]
    }))
  );

const recordedThirdFlightTrack =
  trimTrackAfterLanding(
    thirdFlight.track.map(point => ({
      timestamp: point[0],
      position: [point[1], point[2]],
      altitude: point[3],
      speed: point[4],
      direction: point[5]
    }))
  );

const teltuMergeWaypoint =
  (scenario.waypoints || [])
    .find(waypoint =>
      waypoint.name === 'TELTU'
    );


function closestTrackPointIndex(
  track,
  position
) {

  const longitudeScale =
    Math.cos(
      position[1] * Math.PI / 180
    );

  return track.reduce(
    (closest, point, index) => {

      const longitudeDifference =
        (point.position[0] - position[0]) *
        longitudeScale;

      const latitudeDifference =
        point.position[1] - position[1];

      const distanceSquared =
        longitudeDifference *
          longitudeDifference +
        latitudeDifference *
          latitudeDifference;

      return distanceSquared <
        closest.distanceSquared ?
          {index, distanceSquared} :
          closest;
    },
    {
      index: 0,
      distanceSquared: Infinity
    }
  ).index;
}


function flightPerformanceAt(
  track,
  timestamp
) {

  let pointIndex = 0;

  while (
    pointIndex <
      track.length - 2 &&
    track[pointIndex + 1]
      .timestamp < timestamp
  ) {
    pointIndex++;
  }

  const start =
    track[pointIndex];

  const end =
    track[pointIndex + 1];

  const segmentProgress =
    end.timestamp === start.timestamp ?
      1 :
      Math.min(
        Math.max(
          (timestamp - start.timestamp) /
          (end.timestamp - start.timestamp),
          0
        ),
        1
      );

  return {
    altitude:
      start.altitude +
      (end.altitude - start.altitude) *
        segmentProgress,
    speed:
      start.speed +
      (end.speed - start.speed) *
        segmentProgress
  };
}


const primaryTeltuIndex =
  closestTrackPointIndex(
    flightTrack,
    teltuMergeWaypoint.position
  );

const primaryTeltuDuration =
  flightTrack[primaryTeltuIndex].timestamp -
  flightTrack[0].timestamp;

function createTrackWithSharedTeltuPrefix(
  recordedTrack
) {

  const recordedTeltuIndex =
    closestTrackPointIndex(
      recordedTrack,
      teltuMergeWaypoint.position
    );

  const recordedTeltuDuration =
    recordedTrack[recordedTeltuIndex]
      .timestamp -
    recordedTrack[0].timestamp;

  const sharedPrefix =
    flightTrack
      .slice(0, primaryTeltuIndex + 1)
      .map(point => {

        const prefixProgress =
          primaryTeltuDuration === 0 ?
            0 :
            (point.timestamp -
              flightTrack[0].timestamp) /
              primaryTeltuDuration;

        const timestamp =
          recordedTrack[0].timestamp +
          recordedTeltuDuration *
            prefixProgress;

        const performance =
          flightPerformanceAt(
            recordedTrack,
            timestamp
          );

        return {
          timestamp,
          position: [...point.position],
          altitude: performance.altitude,
          speed: performance.speed,
          direction: point.direction
        };
      });

  return [
    ...sharedPrefix,
    ...recordedTrack.slice(
      recordedTeltuIndex + 1
    )
  ];
}


const secondFlightTrack =
  createTrackWithSharedTeltuPrefix(
    recordedSecondFlightTrack
  );

const thirdFlightTrack =
  createTrackWithSharedTeltuPrefix(
    recordedThirdFlightTrack
  );

const secondRouteCoordinates =
  secondFlightTrack.map(
    point => point.position
  );

const thirdRouteCoordinates =
  thirdFlightTrack.map(
    point => point.position
  );


// ==========================================
// CREATE MAP
// ==========================================

const map = new maplibregl.Map({
  container: 'map',

  style: {
    version: 8,

    sources: {
      world: {
        type: 'vector',
        url: 'https://demotiles.maplibre.org/tiles/tiles.json',
        attribution: 'MapLibre demo tiles'
      }
    },

    layers: [
      {
        id: 'sea',
        type: 'background',

        paint: {
          'background-color': '#e7f1f3'
        }
      },
      {
        id: 'land',
        type: 'fill',
        source: 'world',
        'source-layer': 'countries',

        paint: {
          'fill-color': '#f4f1e8',
          'fill-outline-color': '#ccd4d1'
        }
      },
      {
        id: 'country-boundaries',
        type: 'line',
        source: 'world',
        'source-layer': 'countries',

        paint: {
          'line-color': '#c5cfcc',
          'line-width': 0.7,
          'line-opacity': 0.75
        }
      }
    ]
  },

  center: scenario.map.center,
  zoom: scenario.map.zoom
});

map.addControl(
  new maplibregl.NavigationControl()
);


// ==========================================
// WHEN MAP LOADS
// ==========================================

map.on('load', () => {

  if (flightTrack.length < 2) {
    throw new Error(
      'The flight track needs at least two points.'
    );
  }

  if (secondFlightTrack.length < 2) {
    throw new Error(
      'The second flight track needs at least two points.'
    );
  }

  if (thirdFlightTrack.length < 2) {
    throw new Error(
      'The third flight track needs at least two points.'
    );
  }


  // ==========================================
  // ROUTE DATA
  // ==========================================

  function createRouteFeature(coordinates) {

    return {
      type: 'Feature',

      geometry: {
        type: 'LineString',
        coordinates
      }
    };
  }


  const initialPosition =
    routeCoordinates[0];

  const secondInitialPosition =
    secondRouteCoordinates[0];

  const thirdInitialPosition =
    thirdRouteCoordinates[0];

  map.addSource('route-completed', {
    type: 'geojson',
    data: createRouteFeature([
      initialPosition,
      initialPosition
    ])
  });

  map.addSource('route-ahead', {
    type: 'geojson',
    data: createRouteFeature(
      routeCoordinates
    )
  });

  map.addSource('route-two-completed', {
    type: 'geojson',
    data: createRouteFeature([
      secondInitialPosition,
      secondInitialPosition
    ])
  });

  map.addSource('route-two-ahead', {
    type: 'geojson',
    data: createRouteFeature([
      secondInitialPosition,
      secondInitialPosition
    ])
  });

  map.addSource('route-three-completed', {
    type: 'geojson',
    data: createRouteFeature([
      thirdInitialPosition,
      thirdInitialPosition
    ])
  });


  // ==========================================
  // EGGW RANGE RINGS
  // ==========================================

  function destinationPosition(
    start,
    distanceNm,
    bearingDegrees
  ) {

    const earthRadiusNm =
      3440.065;

    const angularDistance =
      distanceNm / earthRadiusNm;

    const bearing =
      bearingDegrees * Math.PI / 180;

    const startLongitude =
      start[0] * Math.PI / 180;

    const startLatitude =
      start[1] * Math.PI / 180;


    const latitude =
      Math.asin(
        Math.sin(startLatitude) *
          Math.cos(angularDistance) +
        Math.cos(startLatitude) *
          Math.sin(angularDistance) *
          Math.cos(bearing)
      );

    const longitude =
      startLongitude +
      Math.atan2(
        Math.sin(bearing) *
          Math.sin(angularDistance) *
          Math.cos(startLatitude),
        Math.cos(angularDistance) -
          Math.sin(startLatitude) *
          Math.sin(latitude)
      );


    return [
      longitude * 180 / Math.PI,
      latitude * 180 / Math.PI
    ];
  }


  function createRangeRingFeature(
    center,
    distanceNm
  ) {

    const coordinates = [];
    const pointCount = 144;

    for (
      let pointIndex = 0;
      pointIndex <= pointCount;
      pointIndex++
    ) {

      coordinates.push(
        destinationPosition(
          center,
          distanceNm,
          pointIndex / pointCount * 360
        )
      );
    }


    return {
      type: 'Feature',

      properties: {
        distanceNm
      },

      geometry: {
        type: 'LineString',
        coordinates
      }
    };
  }


  function createRangeRingLabel(
    distanceNm
  ) {

    const element =
      document.createElement('div');

    element.className =
      'range-ring-label';

    element.textContent =
      `${distanceNm} NM`;

    element.setAttribute(
      'aria-label',
      `${distanceNm} nautical miles from EGGW`
    );

    return element;
  }


  const rangeRingSettings =
    scenario.rangeRings;

  const rangeRingAirport =
    (scenario.airports || [])
      .find(
        airport =>
          airport.code ===
            rangeRingSettings.airport
      );

  if (!rangeRingAirport) {
    throw new Error(
      'The range-ring airport was not found.'
    );
  }


  const rangeRingFeatures =
    rangeRingSettings.distancesNm
      .map(distanceNm =>
        createRangeRingFeature(
          rangeRingAirport.position,
          distanceNm
        )
      );


  map.addSource('eggw-range-rings', {
    type: 'geojson',

    data: {
      type: 'FeatureCollection',
      features: rangeRingFeatures
    }
  });

  map.addLayer({
    id: 'eggw-range-rings-halo',
    type: 'line',
    source: 'eggw-range-rings',

    paint: {
      'line-color': '#ffffff',
      'line-width': 3.6,
      'line-opacity': 0.56,
      'line-dasharray': [2.2, 2.2]
    }
  });

  map.addLayer({
    id: 'eggw-range-rings',
    type: 'line',
    source: 'eggw-range-rings',

    paint: {
      'line-color': '#697482',
      'line-width': 1.4,
      'line-opacity': 0.52,
      'line-dasharray': [2.2, 2.2]
    }
  });


  rangeRingSettings.distancesNm
    .forEach(distanceNm => {

      new maplibregl.Marker({
        element:
          createRangeRingLabel(
            distanceNm
          ),
        anchor: 'center'
      })
        .setLngLat(
          destinationPosition(
            rangeRingAirport.position,
            distanceNm,
            135
          )
        )
        .addTo(map);
    });


  // ==========================================
  // ROUTE APPEARANCE
  // ==========================================

  map.addLayer({
    id: 'route-ahead-halo',
    type: 'line',
    source: 'route-ahead',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#ffffff',
      'line-width': 6,
      'line-opacity': 0.48,
      'line-dasharray': [1.4, 1.8]
    }
  });

  map.addLayer({
    id: 'route-ahead',
    type: 'line',
    source: 'route-ahead',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#5f8f73',
      'line-width': 3,
      'line-opacity': 0.76,
      'line-dasharray': [1.4, 1.8]
    }
  });

  map.addLayer({
    id: 'route-completed-halo',
    type: 'line',
    source: 'route-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#ffffff',
      'line-width': 6,
      'line-opacity': 0.52,
      'line-blur': 0.7
    }
  });

  map.addLayer({
    id: 'route-completed',
    type: 'line',
    source: 'route-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#5f8f73',
      'line-width': 3,
      'line-opacity': 0.76
    }
  });

  map.addLayer({
    id: 'route-two-ahead-halo',
    type: 'line',
    source: 'route-two-ahead',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#ffffff',
      'line-width': 6,
      'line-opacity': 0.42,
      'line-dasharray': [1.4, 1.8]
    }
  });

  map.addLayer({
    id: 'route-two-ahead',
    type: 'line',
    source: 'route-two-ahead',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#397764',
      'line-width': 3,
      'line-opacity': 0.68,
      'line-dasharray': [1.4, 1.8]
    }
  });

  map.addLayer({
    id: 'route-two-completed-halo',
    type: 'line',
    source: 'route-two-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#ffffff',
      'line-width': 6,
      'line-opacity': 0.48,
      'line-blur': 0.7
    }
  });

  map.addLayer({
    id: 'route-two-completed',
    type: 'line',
    source: 'route-two-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#397764',
      'line-width': 3,
      'line-opacity': 0.84
    }
  });

  map.addLayer({
    id: 'route-three-completed-halo',
    type: 'line',
    source: 'route-three-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#ffffff',
      'line-width': 6,
      'line-opacity': 0.48,
      'line-blur': 0.7
    }
  });

  map.addLayer({
    id: 'route-three-completed',
    type: 'line',
    source: 'route-three-completed',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#6f9348',
      'line-width': 3.2,
      'line-opacity': 0.9
    }
  });


  // ==========================================
  // TOP OF DESCENT
  // ==========================================

  function findTopOfDescentPoint(track) {

    const maximumAltitude =
      Math.max(
        ...track.map(
          point => point.altitude
        )
      );

    const cruiseAltitudeFloor =
      maximumAltitude - 100;

    const descentWindowSize = 4;


    for (
      let pointIndex = 1;
      pointIndex <=
        track.length - descentWindowSize;
      pointIndex++
    ) {

      const point =
        track[pointIndex];

      if (
        point.altitude >=
          cruiseAltitudeFloor
      ) {
        continue;
      }


      const descentWindow =
        track.slice(
          pointIndex,
          pointIndex + descentWindowSize
        );

      const isContinuouslyDescending =
        descentWindow.every(
          (windowPoint, windowIndex) =>
            windowIndex === 0 ||
            windowPoint.altitude <=
              descentWindow[
                windowIndex - 1
              ].altitude
        );

      const descentAmount =
        descentWindow[0].altitude -
        descentWindow[
          descentWindow.length - 1
        ].altitude;


      if (
        isContinuouslyDescending &&
        descentAmount >= 1000
      ) {
        return track[pointIndex - 1];
      }
    }


    return track.reduce(
      (highestPoint, point) =>
        point.altitude >
          highestPoint.altitude ?
            point :
            highestPoint,
      track[0]
    );
  }


  function trackSegmentDistanceNm(
    startPosition,
    endPosition
  ) {

    const earthRadiusNm = 3440.065;

    const startLatitude =
      startPosition[1] * Math.PI / 180;

    const endLatitude =
      endPosition[1] * Math.PI / 180;

    const latitudeChange =
      endLatitude - startLatitude;

    const longitudeChange =
      (endPosition[0] - startPosition[0]) *
      Math.PI / 180;

    const haversine =
      Math.sin(latitudeChange / 2) ** 2 +
      Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeChange / 2) ** 2;


    return earthRadiusNm *
      2 *
      Math.atan2(
        Math.sqrt(haversine),
        Math.sqrt(1 - haversine)
      );
  }


  function progressBeforeTrackPoint(
    track,
    targetPoint,
    distanceNm
  ) {

    const targetIndex =
      track.indexOf(targetPoint);

    const firstTimestamp =
      track[0].timestamp;

    const trackDuration =
      track[track.length - 1].timestamp -
      firstTimestamp;

    let remainingDistance = distanceNm;


    for (
      let pointIndex = targetIndex;
      pointIndex > 0;
      pointIndex--
    ) {

      const start = track[pointIndex - 1];
      const end = track[pointIndex];

      const segmentDistance =
        trackSegmentDistanceNm(
          start.position,
          end.position
        );

      if (
        segmentDistance >=
          remainingDistance &&
        segmentDistance > 0
      ) {

        const segmentProgress =
          (segmentDistance -
            remainingDistance) /
          segmentDistance;

        const timestamp =
          start.timestamp +
          (end.timestamp - start.timestamp) *
          segmentProgress;


        return trackDuration === 0 ?
          0 :
          (timestamp - firstTimestamp) /
            trackDuration;
      }

      remainingDistance -= segmentDistance;
    }


    return 0;
  }


  function createTopOfDescentSymbol(
    topOfDescentPoint
  ) {

    const element =
      document.createElement('div');

    element.className =
      'top-of-descent-marker';

    element.setAttribute(
      'role',
      'img'
    );

    element.setAttribute(
      'aria-label',
      'Top of descent at ' +
      `${Math.round(
        topOfDescentPoint.altitude / 100
      ) * 100} feet`
    );


    const arrow =
      document.createElement('canvas');

    arrow.className =
      'top-of-descent-arrow';

    arrow.width = 120;
    arrow.height = 72;

    arrow.setAttribute(
      'aria-hidden',
      'true'
    );


    const arrowContext =
      arrow.getContext('2d');


    arrowContext.scale(2, 2);
    arrowContext.strokeStyle = '#ffffff';
    arrowContext.lineWidth = 3.5;
    arrowContext.lineCap = 'round';
    arrowContext.lineJoin = 'round';

    arrowContext.beginPath();
    arrowContext.moveTo(4, 8);
    arrowContext.lineTo(34, 8);
    arrowContext.lineTo(52, 30);

    arrowContext.moveTo(52, 30);
    arrowContext.lineTo(49, 18);

    arrowContext.moveTo(52, 30);
    arrowContext.lineTo(38, 26);

    arrowContext.stroke();


    element.appendChild(arrow);

    return element;
  }


  const topOfDescentPoint =
    findTopOfDescentPoint(
      flightTrack
    );

  const topOfDescentElement =
    createTopOfDescentSymbol(
      topOfDescentPoint
    );

  const topOfDescentProgress =
    (topOfDescentPoint.timestamp -
      flightTrack[0].timestamp) /
    (
      flightTrack[
        flightTrack.length - 1
      ].timestamp -
      flightTrack[0].timestamp
    );

  const descentSelectionProgress =
    progressBeforeTrackPoint(
      flightTrack,
      topOfDescentPoint,
      10
    );

  new maplibregl.Marker({
    element: topOfDescentElement,
    anchor: 'center'
  })
    .setLngLat(
      topOfDescentPoint.position
    )
    .addTo(map);

  const secondTopOfDescentPoint =
    findTopOfDescentPoint(
      secondFlightTrack
    );

  const secondTopOfDescentElement =
    createTopOfDescentSymbol(
      secondTopOfDescentPoint
    );

  const secondTopOfDescentProgress =
    (
      secondTopOfDescentPoint.timestamp -
      secondFlightTrack[0].timestamp
    ) /
    (
      secondFlightTrack[
        secondFlightTrack.length - 1
      ].timestamp -
      secondFlightTrack[0].timestamp
    );

  const secondDescentSelectionProgress =
    progressBeforeTrackPoint(
      secondFlightTrack,
      secondTopOfDescentPoint,
      10
    );

  secondTopOfDescentElement.style.visibility =
    'hidden';

  new maplibregl.Marker({
    element: secondTopOfDescentElement,
    anchor: 'center'
  })
    .setLngLat(
      secondTopOfDescentPoint.position
    )
    .addTo(map);

  const thirdTopOfDescentPoint =
    findTopOfDescentPoint(
      thirdFlightTrack
    );

  const thirdTopOfDescentElement =
    createTopOfDescentSymbol(
      thirdTopOfDescentPoint
    );

  const thirdTopOfDescentProgress =
    (
      thirdTopOfDescentPoint.timestamp -
      thirdFlightTrack[0].timestamp
    ) /
    (
      thirdFlightTrack[
        thirdFlightTrack.length - 1
      ].timestamp -
      thirdFlightTrack[0].timestamp
    );

  const thirdDescentSelectionProgress =
    progressBeforeTrackPoint(
      thirdFlightTrack,
      thirdTopOfDescentPoint,
      10
    );

  thirdTopOfDescentElement.style.visibility =
    'hidden';

  new maplibregl.Marker({
    element: thirdTopOfDescentElement,
    anchor: 'center'
  })
    .setLngLat(
      thirdTopOfDescentPoint.position
    )
    .addTo(map);


  function updateTopOfDescentVisibility(
    playbackProgress,
    element = topOfDescentElement,
    descentProgress = topOfDescentProgress
  ) {

    const hasReachedTopOfDescent =
      playbackProgress >=
        descentProgress;

    if (
      element.hasReachedTopOfDescent ===
        hasReachedTopOfDescent
    ) {
      return;
    }

    element.hasReachedTopOfDescent =
      hasReachedTopOfDescent;

    element.style.opacity =
      hasReachedTopOfDescent ?
        '0' :
        '1';

    element.setAttribute(
      'aria-hidden',
      hasReachedTopOfDescent ?
        'true' :
        'false'
    );
  }


  // ==========================================
  // TELTU 1N ROUTE
  // ==========================================

  const teltu1nCoordinates =
    (scenario.waypoints || [])
      .map(waypoint => waypoint.position);

  map.addSource('teltu1n-line', {
    type: 'geojson',
    data: createRouteFeature(
      teltu1nCoordinates
    )
  });

  map.addLayer({
    id: 'teltu1n-line',
    type: 'line',
    source: 'teltu1n-line',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#c65f98',
      'line-width': 2,
      'line-opacity': 0.56
    }
  });


  // ==========================================
  // ZAGZO 1Q TRANSITION
  // ==========================================

  const zagzo1qCoordinates =
    (scenario.zagzo1qTransition || [])
      .map(point => point.position);

  map.addSource('zagzo1q-line', {
    type: 'geojson',
    data: createRouteFeature(
      zagzo1qCoordinates
    )
  });

  map.addSource('zagzo1q-points', {
    type: 'geojson',

    data: {
      type: 'FeatureCollection',

      features:
        zagzo1qCoordinates.map(
          position => ({
            type: 'Feature',

            geometry: {
              type: 'Point',
              coordinates: position
            }
          })
        )
    }
  });


  function createProcedureWaypointImage() {

    const canvas =
      document.createElement('canvas');

    canvas.width = 20;
    canvas.height = 20;


    const context =
      canvas.getContext('2d');

    context.beginPath();
    context.moveTo(10, 2);
    context.lineTo(18, 17);
    context.lineTo(2, 17);
    context.closePath();

    context.fillStyle =
      'rgba(255, 255, 255, 0.96)';
    context.fill();

    context.strokeStyle = '#c65f98';
    context.lineWidth = 2.5;
    context.lineJoin = 'round';
    context.stroke();


    return context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );
  }


  map.addImage(
    'procedure-waypoint-triangle',
    createProcedureWaypointImage(),
    {
      pixelRatio: 2
    }
  );

  map.addLayer({
    id: 'zagzo1q-line',
    type: 'line',
    source: 'zagzo1q-line',

    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },

    paint: {
      'line-color': '#c65f98',
      'line-width': 2,
      'line-opacity': 0.42
    }
  });

  map.addLayer({
    id: 'zagzo1q-points',
    type: 'symbol',
    source: 'zagzo1q-points',

    layout: {
      'icon-image':
        'procedure-waypoint-triangle',
      'icon-anchor': 'center',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true
    }
  });


  // ==========================================
  // TELTU 1N WAYPOINTS
  // ==========================================

  function createWaypointMarker(
    waypoint
  ) {

    const element =
      document.createElement('div');

    element.className =
      'waypoint-marker';

    element.setAttribute(
      'role',
      'img'
    );

    element.setAttribute(
      'aria-label',
      waypoint.level ?
        `${waypoint.name}, ${waypoint.level}` :
        waypoint.name
    );


    const symbol =
      document.createElement('span');

    symbol.className =
      'waypoint-symbol';


    const label =
      document.createElement('span');

    label.className =
      'waypoint-label';


    const name =
      document.createElement('strong');

    name.textContent =
      waypoint.name;

    label.appendChild(name);


    if (waypoint.level) {

      const level =
        document.createElement('span');

      level.className =
        'waypoint-level';

      level.textContent =
        waypoint.level;

      label.appendChild(level);
    }


    element.appendChild(symbol);
    element.appendChild(label);

    return element;
  }


  const teltu1nWaypointElements = [];

  (scenario.waypoints || [])
    .forEach(waypoint => {

      const element =
        createWaypointMarker(
          waypoint
        );

      teltu1nWaypointElements.push(
        element
      );

      new maplibregl.Marker({
        element,
        anchor: 'center'
      })
        .setLngLat(
          waypoint.position
        )
        .addTo(map);
    });


  // ==========================================
  // LONDON AIRPORTS
  // ==========================================

  function createAirportMarker(
    airport
  ) {

    const element =
      document.createElement('div');

    element.className =
      `airport-marker airport-marker--${airport.labelPosition}`;

    element.setAttribute(
      'role',
      'img'
    );

    element.setAttribute(
      'aria-label',
      `${airport.name} Airport, ${airport.code}`
    );


    const symbol =
      document.createElement('span');

    symbol.className =
      'airport-symbol';


    const label =
      document.createElement('span');

    label.className =
      'airport-label';


    const code =
      document.createElement('span');

    code.className =
      'airport-code';

    code.textContent =
      airport.code;


    label.appendChild(code);
    element.appendChild(symbol);
    element.appendChild(label);

    return element;
  }


  function createRunwayDiagram(
    airport
  ) {

    const element =
      document.createElement('div');

    element.className =
      airport.runways.length > 1 ?
        'runway-marker runway-marker--parallel' :
        'runway-marker';

    element.setAttribute(
      'aria-hidden',
      'true'
    );


    airport.runways.forEach(
      (runway, index) => {

        const strip =
          document.createElement('span');

        strip.className =
          `runway-strip runway-strip--${index + 1}`;

        strip.setAttribute(
          'data-runway',
          runway
        );

        element.appendChild(strip);
      }
    );

    return element;
  }


  (scenario.airports || [])
    .forEach(airport => {

      new maplibregl.Marker({
        element:
          createRunwayDiagram(
            airport
          ),
        anchor: 'center',
        rotationAlignment: 'map'
      })
        .setLngLat(
          airport.position
        )
        .setRotation(
          airport.runwayHeading
        )
        .addTo(map);


      new maplibregl.Marker({
        element:
          createAirportMarker(
            airport
          ),
        anchor: 'center'
      })
        .setLngLat(
          airport.position
        )
        .addTo(map);
    });


  // ==========================================
  // HEATHROW 09 TRAFFIC
  // ==========================================

  function createTrafficAircraftSymbol(
    movement,
    runway,
    sequenceNumber
  ) {

    const element =
      document.createElement('div');

    element.className =
      `traffic-aircraft-marker traffic-aircraft-marker--${movement}`;

    element.setAttribute(
      'role',
      'img'
    );

    element.setAttribute(
      'aria-label',
      `Heathrow ${movement} ${sequenceNumber}, runway ${runway}`
    );


    [
      'fuselage',
      'wings',
      'tail'
    ].forEach(partName => {

      const part =
        document.createElement('span');

      part.className =
        `traffic-aircraft-part traffic-aircraft-${partName}`;

      element.appendChild(part);
    });

    return element;
  }


  function interpolateTrafficPosition(
    start,
    end,
    progress
  ) {

    return [
      interpolate(
        start[0],
        end[0],
        progress
      ),
      interpolate(
        start[1],
        end[1],
        progress
      )
    ];
  }


  function trafficWindowProgress(
    playbackProgress,
    startProgress,
    endProgress
  ) {

    return Math.min(
      Math.max(
        (playbackProgress - startProgress) /
          (endProgress - startProgress),
        0
      ),
      1
    );
  }


  const heathrowTraffic =
    scenario.heathrowTraffic;

  const arrivalTraffic =
    heathrowTraffic.arrival;

  const departureTraffic =
    heathrowTraffic.departure;


  const arrivalStart =
    destinationPosition(
      arrivalTraffic.threshold,
      arrivalTraffic.approachDistanceNm,
      heathrowTraffic.heading + 180
    );

  const arrivalEnd =
    arrivalTraffic.runwayEnd;

  const departureStart =
    departureTraffic.threshold;

  const departureEnd =
    destinationPosition(
      departureTraffic.runwayEnd,
      departureTraffic.climbDistanceNm,
      heathrowTraffic.heading
    );


  function createTrafficStream(
    movement,
    settings,
    start,
    end
  ) {

    return settings.startProgresses
      .map(
        (startProgress, index) => {

          const element =
            createTrafficAircraftSymbol(
              movement,
              settings.runway,
              index + 1
            );

          const marker =
            new maplibregl.Marker({
              element,
              rotationAlignment: 'map'
            })
              .setLngLat(start)
              .setRotation(
                heathrowTraffic.heading
              )
              .addTo(map);


          return {
            element,
            marker,
            start,
            end,
            startProgress,
            endProgress:
              startProgress +
              settings.durationProgress
          };
        }
      );
  }


  const arrivalTrafficStream =
    [];

  const departureTrafficStream =
    [];


  function updateHeathrowTraffic(
    playbackProgress
  ) {

    [
      ...arrivalTrafficStream,
      ...departureTrafficStream
    ].forEach(movement => {

      const progress =
        trafficWindowProgress(
          playbackProgress,
          movement.startProgress,
          movement.endProgress
        );

      movement.marker.setLngLat(
        interpolateTrafficPosition(
          movement.start,
          movement.end,
          progress
        )
      );

      movement.element.style.opacity =
        playbackProgress >=
          movement.startProgress &&
        playbackProgress <
          movement.endProgress ?
          '1' :
          '0';
    });
  }


  function resetHeathrowTraffic() {

    [
      ...arrivalTrafficStream,
      ...departureTrafficStream
    ].forEach(movement => {

      movement.marker
        .setLngLat(movement.start);

      movement.element.style.opacity =
        movement.startProgress === 0 ?
          '1' :
          '0';
    });
  }


  function updateRouteProgress(
    pointIndex,
    position,
    coordinates = routeCoordinates,
    completedSourceId = 'route-completed',
    aheadSourceId = 'route-ahead'
  ) {

    const completedCoordinates =
      coordinates.slice(
        0,
        pointIndex + 1
      );

    completedCoordinates.push(
      position
    );


    map
      .getSource(completedSourceId)
      .setData(
        createRouteFeature(
          completedCoordinates
        )
      );

    if (!aheadSourceId) {
      return;
    }

    const aheadCoordinates = [
      position,
      ...coordinates.slice(
        pointIndex + 1
      )
    ];

    if (aheadCoordinates.length === 1) {
      aheadCoordinates.push(
        position
      );
    }

    map
      .getSource(aheadSourceId)
      .setData(
        createRouteFeature(
          aheadCoordinates
        )
      );
  }


  function hideSecondRoute() {

    const hiddenRoute =
      createRouteFeature([
        secondInitialPosition,
        secondInitialPosition
      ]);

    map
      .getSource('route-two-completed')
      .setData(hiddenRoute);

    map
      .getSource('route-two-ahead')
      .setData(hiddenRoute);
  }


  function hideThirdRoute() {

    const hiddenRoute =
      createRouteFeature([
        thirdInitialPosition,
        thirdInitialPosition
      ]);

    map
      .getSource('route-three-completed')
      .setData(hiddenRoute);
  }


  function setPrimaryRouteActive(
    isActive
  ) {

    map.setPaintProperty(
      'route-completed',
      'line-color',
      isActive ? '#5f8f73' : '#cbd6cf'
    );

    map.setPaintProperty(
      'route-completed',
      'line-opacity',
      isActive ? 0.76 : 0.52
    );

    map.setPaintProperty(
      'route-completed',
      'line-width',
      isActive ? 3 : 2.25
    );

    map.setPaintProperty(
      'route-completed-halo',
      'line-opacity',
      isActive ? 0.52 : 0.12
    );
  }


  function restoreSecondRouteStyle() {

    map.setPaintProperty(
      'route-two-completed',
      'line-color',
      '#397764'
    );

    map.setPaintProperty(
      'route-two-completed',
      'line-opacity',
      0.84
    );

    map.setPaintProperty(
      'route-two-completed',
      'line-width',
      3
    );

    map.setPaintProperty(
      'route-two-completed-halo',
      'line-opacity',
      0.48
    );
  }


  function restoreThirdRouteStyle() {

    map.setPaintProperty(
      'route-three-completed',
      'line-color',
      '#6f9348'
    );

    map.setPaintProperty(
      'route-three-completed',
      'line-opacity',
      0.9
    );

    map.setPaintProperty(
      'route-three-completed',
      'line-width',
      3.2
    );

    map.setPaintProperty(
      'route-three-completed-halo',
      'line-opacity',
      0.48
    );
  }


  function softenCompletedRoute(choiceKey) {

    if (choiceKey === 'one') {
      setPrimaryRouteActive(false);
      return;
    }

    const route =
      choiceKey === 'two' ?
        {
          line: 'route-two-completed',
          halo: 'route-two-completed-halo',
          colour: '#d8e2dc'
        } :
        {
          line: 'route-three-completed',
          halo: 'route-three-completed-halo',
          colour: '#dce4d2'
        };

    map.setPaintProperty(
      route.line,
      'line-color',
      route.colour
    );

    map.setPaintProperty(
      route.line,
      'line-opacity',
      0.2
    );

    map.setPaintProperty(
      route.line,
      'line-width',
      2
    );

    map.setPaintProperty(
      route.halo,
      'line-opacity',
      0
    );
  }


  function fadeEarlierRoutesForThirdFlight() {

    [
      {
        line: 'route-completed',
        halo: 'route-completed-halo',
        colour: '#dce4df'
      },
      {
        line: 'route-two-completed',
        halo: 'route-two-completed-halo',
        colour: '#d8e2dc'
      }
    ].forEach(route => {

      map.setPaintProperty(
        route.line,
        'line-color',
        route.colour
      );

      map.setPaintProperty(
        route.line,
        'line-opacity',
        0.14
      );

      map.setPaintProperty(
        route.line,
        'line-width',
        1.8
      );

      map.setPaintProperty(
        route.halo,
        'line-opacity',
        0
      );
    });
  }


  // ==========================================
  // AIRCRAFT
  // ==========================================

  function createOwnAircraftSymbol(size) {

    const element =
      document.createElement('div');

    element.className =
      'own-aircraft-marker';

    element.style.width =
      `${size}px`;

    element.style.height =
      `${Math.round(size * 1.5)}px`;

    element.innerHTML = `
      <img
        src="assets/a321-wizz-pink-tail.png"
        alt=""
        draggable="false"
      >
    `;

    return element;
  }


  const aircraftMarker =
    new maplibregl.Marker({
      element: createOwnAircraftSymbol(52),
      rotationAlignment: 'map'
    })
      .setLngLat(initialPosition)
      .setRotation(
        flightTrack[0].direction
      )
      .addTo(map);


  // ==========================================
  // FIT THE COMPLETE ROUTE
  // ==========================================

  const longitudes =
    routeCoordinates.map(
      position => position[0]
    );

  const latitudes =
    routeCoordinates.map(
      position => position[1]
    );

  map.fitBounds(
    [
      [
        Math.min(...longitudes),
        Math.min(...latitudes)
      ],
      [
        Math.max(...longitudes),
        Math.max(...latitudes)
      ]
    ],
    {
      padding: 70,
      duration: 0,
      maxZoom: 6
    }
  );


  const routeOverviewCamera = {
    center: map.getCenter().toArray(),
    zoom: map.getZoom()
  };

  const aircraftTrackingZoom =
    Math.min(
      routeOverviewCamera.zoom + 1.6,
      7.8
    );

  const zoomStartProgress =
    topOfDescentProgress;

  const useLightweightMobileAnimation =
    window.matchMedia(
      '(max-width: 640px), (pointer: coarse)'
    ).matches;

  const cameraUpdateInterval =
    useLightweightMobileAnimation ?
      1000 / 30 :
      100;

  let lastCameraUpdateTime =
    -Infinity;


  function resetCamera() {

    map.stop();

    lastCameraUpdateTime =
      -Infinity;

    map.jumpTo({
      center: routeOverviewCamera.center,
      zoom: routeOverviewCamera.zoom
    });
  }


  function trackAircraft(
    position,
    playbackProgress,
    frameTime,
    cameraZoomStartProgress =
      zoomStartProgress
  ) {

    if (
      playbackProgress < 1 &&
      frameTime - lastCameraUpdateTime <
        cameraUpdateInterval
    ) {
      return;
    }

    lastCameraUpdateTime =
      frameTime;

    const zoomProgress =
      Math.min(
        Math.max(
          (
            playbackProgress -
            cameraZoomStartProgress
          ) /
          (1 - cameraZoomStartProgress),
          0
        ),
        1
      );

    const smoothZoomProgress =
      zoomProgress * zoomProgress *
      (3 - 2 * zoomProgress);

    const cameraPosition = {
      center: position,
      zoom: interpolate(
        routeOverviewCamera.zoom,
        aircraftTrackingZoom,
        smoothZoomProgress
      )
    };

    if (useLightweightMobileAnimation) {
      map.jumpTo(cameraPosition);
      return;
    }

    map.easeTo({
      ...cameraPosition,
      duration: 180,
      easing: progress => progress
    });
  }


  // ==========================================
  // SCREEN ELEMENTS
  // ==========================================

  const nextButton =
    document.getElementById('nextButton');

  const stageNumber =
    document.getElementById('stageNumber');

  const stageName =
    document.getElementById('stageName');

  const stageText =
    document.getElementById('stageText');

  const flightChoicePanel =
    document.getElementById(
      'flightChoicePanel'
    );

  const flightChoiceText =
    document.getElementById(
      'flightChoiceText'
    );

  const flightChoiceOne =
    document.getElementById(
      'flightChoiceOne'
    );

  const flightChoiceTwo =
    document.getElementById(
      'flightChoiceTwo'
    );

  const flightChoiceThree =
    document.getElementById(
      'flightChoiceThree'
    );

  const interactionPausePanel =
    document.getElementById(
      'interactionPausePanel'
    );

  const interactionPauseKicker =
    document.getElementById(
      'interactionPauseKicker'
    );

  const interactionPauseTitle =
    document.getElementById(
      'interactionPauseTitle'
    );

  const interactionEmbed =
    document.getElementById(
      'interactionEmbed'
    );

  const interactionPauseNumber =
    document.getElementById(
      'interactionPauseNumber'
    );

  const interactionPauseText =
    document.getElementById(
      'interactionPauseText'
    );

  const interactionResourceButton =
    document.getElementById(
      'interactionResourceButton'
    );

  const interactionResourceThumbnail =
    document.getElementById(
      'interactionResourceThumbnail'
    );

  const interactionContinueButton =
    document.getElementById(
      'interactionContinueButton'
    );

  const descentModesPrompt =
    document.getElementById(
      'descentModesPrompt'
    );

  const descentModesOverlay =
    document.getElementById(
      'descentModesOverlay'
    );

  const descentModesNumber =
    document.getElementById(
      'descentModesNumber'
    );

  const descentModesVideo =
    document.getElementById(
      'descentModesVideo'
    );

  const descentModesClose =
    document.getElementById(
      'descentModesClose'
    );

  const displayMenuToggle =
    document.getElementById(
      'displayMenuToggle'
    );

  const displayMenuContent =
    document.getElementById(
      'displayMenuContent'
    );

  const flightBagMenuToggle =
    document.getElementById(
      'flightBagMenuToggle'
    );

  const flightBagMenuContent =
    document.getElementById(
      'flightBagMenuContent'
    );

  const flightBagWeatherButton =
    document.getElementById(
      'flightBagWeather'
    );

  const flightBagWeatherOverlay =
    document.getElementById(
      'flightBagWeatherOverlay'
    );

  const flightBagWeatherClose =
    document.getElementById(
      'flightBagWeatherClose'
    );

  const flightBagLidoButton =
    document.getElementById(
      'flightBagLido'
    );

  const flightBagLidoOverlay =
    document.getElementById(
      'flightBagLidoOverlay'
    );

  const flightBagLidoClose =
    document.getElementById(
      'flightBagLidoClose'
    );

  const lidoPlateChoices =
    document.querySelectorAll(
      '.lido-plate-choice'
    );

  const lidoPlateViewer =
    document.getElementById(
      'lidoPlateViewer'
    );

  const lidoPlateViewerTitle =
    document.getElementById(
      'lidoPlateViewerTitle'
    );

  const lidoPlateViewerImage =
    document.getElementById(
      'lidoPlateViewerImage'
    );

  const lidoPlateViewerClose =
    document.getElementById(
      'lidoPlateViewerClose'
    );

  const interactionResourceViewer =
    document.getElementById(
      'interactionResourceViewer'
    );

  const interactionResourceViewerTitle =
    document.getElementById(
      'interactionResourceViewerTitle'
    );

  const interactionResourceViewerImage =
    document.getElementById(
      'interactionResourceViewerImage'
    );

  const interactionResourceViewerClose =
    document.getElementById(
      'interactionResourceViewerClose'
    );

  const questionContentButton =
    document.getElementById(
      'questionContentButton'
    );

  const questionContentOverlay =
    document.getElementById(
      'questionContentOverlay'
    );

  const questionContentNumber =
    document.getElementById(
      'questionContentNumber'
    );

  const questionContentTitle =
    document.getElementById(
      'questionContentTitle'
    );

  const questionContentClose =
    document.getElementById(
      'questionContentClose'
    );

  const questionContentText =
    document.getElementById(
      'questionContentText'
    );

  const questionContentNext =
    document.getElementById(
      'questionContentNext'
    );

  const questionContentProgressText =
    document.getElementById(
      'questionContentProgressText'
    );

  const questionContentProgress =
    document.getElementById(
      'questionContentProgress'
    );

  const questionContentProgressFill =
    document.getElementById(
      'questionContentProgressFill'
    );

  const questionContentProgressRow =
    document.getElementById(
      'questionContentProgressRow'
    );

  const descentManagementQuestionSlider =
    document.getElementById(
      'descentManagementQuestionSlider'
    );

  const questionContentChoices =
    document.getElementById(
      'questionContentChoices'
    );

  const questionContentChoiceButtons =
    questionContentChoices.querySelectorAll(
      'button'
    );

  const descentManagementVideo =
    document.getElementById(
      'descentManagementVideo'
    );

  const referenceContentButton =
    document.getElementById(
      'referenceContentButton'
    );

  const referenceContentOverlay =
    document.getElementById(
      'referenceContentOverlay'
    );

  const referenceContentClose =
    document.getElementById(
      'referenceContentClose'
    );

  const referenceContentNumber =
    document.getElementById(
      'referenceContentNumber'
    );

  const referenceContentIntro =
    document.getElementById(
      'referenceContentIntro'
    );

  const referenceContentList =
    document.getElementById(
      'referenceContentList'
    );

  const timestampOneQuestions = [
    'How could the forecast weather affect the approach?',
    'What Extra fuel / time are you likely to have?',
    'What threats could we face between TOD and the runway?'
  ];

  const timestampFourQuestions = [
    'Does selecting anti-icing ON affect the descent profile?'
  ];

  const timestampFiveQuestions = [
    'Are we permitted to fly in airspace with TCAS inoperative?',
    'What are your actions if a resolution advisory becomes active?'
  ];

  const timestampReferences = {
    4000: [
      {
        label: 'OMA',
        text: '8.3.0.1.1.9.4 – Rate of descent'
      },
      {
        label: 'FCTM',
        text: 'PR-NP-SOP-170 P (Pages 293–299)'
      },
      {
        label: 'LIDO',
        text: '3.189.4.4 (Example for UK)'
      }
    ],
    11600: [
      {
        label: 'FCOM',
        text: 'LIM/Ice and Rain Protection – Page 5153'
      },
      {
        label: 'FCOM',
        text: 'PRO-NOR-SOP – Page 4563'
      }
    ]
  };

  const timestampThreeQuestions = [
    {
      text:
        'When in a managed descent, what modes will the aircraft default to, if given a heading?',
      answers: [
        'OP DES / HDG',
        'FPA / HDG',
        'V/S / HDG'
      ],
      correctAnswerIndex: 2,
      hasVideo: true,
      videoSrc:
        'assets/descent-management-vs-hdg.mp4?v=20260828-1'
    },
    {
      text:
        'If ATC ask you to be level abeam TELTU, are you complying currently?',
      answers: [
        'Yes – no FCU change required',
        'No – unable',
        'No – increase V/S'
      ],
      correctAnswerIndex: 2,
      hasVideo: true,
      videoSrc:
        'assets/descent-management-teltu-level.mp4?v=20260828-1'
    },
    {
      text:
        'How else could we adjust the flight path to achieve a level abeam TELTU?',
      answers: [
        'Increase speed – consider speed brake',
        'Push for DES mode',
        'Unable'
      ],
      correctAnswerIndex: 0,
      hasVideo: true,
      videoSrc:
        'assets/descent-management-speed-brake.mp4?v=20260828-1'
    }
  ];

  let questionContentIndex = 0;
  let descentManagementQuestionIndex = 0;
  let activeQuestionTimestamp = null;
  let activeReferenceTimestamp = null;

  const magentaRouteToggle =
    document.getElementById(
      'magentaRouteToggle'
    );

  const verticalProfileToggle =
    document.getElementById(
      'verticalProfileToggle'
    );

  const pfdToggle =
    document.getElementById('pfdToggle');

  const verticalProfilePanel =
    document.getElementById(
      'verticalProfilePanel'
    );

  const verticalProfileCanvas =
    document.getElementById(
      'verticalProfileCanvas'
    );

  const verticalProfileAltitude =
    document.getElementById(
      'verticalProfileAltitude'
    );

  const pauseButton =
    document.getElementById('pauseButton');

  const restartButton =
    document.getElementById(
      'restartButton'
    );

  const previousTimestampButton =
    document.getElementById(
      'previousTimestampButton'
    );

  const nextTimestampButton =
    document.getElementById(
      'nextTimestampButton'
    );

  const playbackToggleSymbol =
    document.getElementById(
      'playbackToggleSymbol'
    );

  const playbackTimer =
    document.getElementById('playbackTimer');

  const pfdPanel =
    document.getElementById('pfdPanel');

  const pfdCanvas =
    document.getElementById('pfdCanvas');

  const pfdFlightLabel =
    document.getElementById(
      'pfdFlightLabel'
    );

  const verticalProfileContext =
    verticalProfileCanvas.getContext('2d');

  const pfdContext =
    pfdCanvas ?
      pfdCanvas.getContext('2d') :
      null;


  stageNumber.textContent =
    `${scenario.id} • ` +
    `${scenario.title} → ${secondFlight.title} → ` +
    `${thirdFlight.title}`;


  // ==========================================
  // DISPLAY TOGGLES
  // ==========================================

  let magentaRoutesVisible = true;
  let verticalProfileVisible = true;
  let pfdVisible = false;
  let latestPfdState = null;
  let lastSelectedLidoPlate = null;


  function setControlMenuOpen(
    button,
    content,
    isOpen
  ) {

    button.setAttribute(
      'aria-expanded',
      isOpen ? 'true' : 'false'
    );

    content.hidden = !isOpen;

    const symbol =
      button.querySelector(
        '.control-menu-symbol'
      );

    symbol.textContent =
      isOpen ? '−' : '+';
  }


  function addControlMenuBehaviour(
    button,
    content
  ) {

    button.addEventListener(
      'click',
      () => {

        const isOpen =
          button.getAttribute(
            'aria-expanded'
          ) === 'true';

        setControlMenuOpen(
          button,
          content,
          !isOpen
        );
      }
    );

    setControlMenuOpen(
      button,
      content,
      false
    );
  }


  function openFlightBagWeather() {

    flightBagLidoOverlay.hidden = true;
    lidoPlateViewer.hidden = true;
    flightBagWeatherOverlay.hidden = false;
    flightBagWeatherClose.focus();
  }


  function closeFlightBagWeather() {

    flightBagWeatherOverlay.hidden = true;
    flightBagWeatherButton.focus();
  }


  function openFlightBagLido() {

    flightBagWeatherOverlay.hidden = true;
    lidoPlateViewer.hidden = true;
    flightBagLidoOverlay.hidden = false;

    const firstPlate =
      lidoPlateChoices[0];

    if (firstPlate) {
      firstPlate.focus();
    }
  }


  function closeFlightBagLido() {

    flightBagLidoOverlay.hidden = true;
    lidoPlateViewer.hidden = true;
    flightBagLidoButton.focus();
  }


  function openLidoPlate(plateButton) {

    const plateTitle =
      plateButton.dataset.plateTitle;

    lastSelectedLidoPlate =
      plateButton;

    lidoPlateViewerTitle.textContent =
      plateTitle;

    lidoPlateViewerImage.src =
      plateButton.dataset.plateSrc;

    lidoPlateViewerImage.alt =
      `${plateTitle} Lido plate`;

    flightBagLidoOverlay.hidden = true;
    lidoPlateViewer.hidden = false;
    lidoPlateViewerClose.focus();
  }


  function closeLidoPlateViewer() {

    lidoPlateViewer.hidden = true;
    flightBagLidoOverlay.hidden = false;

    if (lastSelectedLidoPlate) {
      lastSelectedLidoPlate.focus();
    }
  }


  function openInteractionResource() {

    const resourceSource =
      interactionResourceButton.dataset
        .resourceSrc;

    if (!resourceSource) {
      return;
    }

    const resourceTitle =
      interactionResourceButton.dataset
        .resourceTitle ||
      'Interaction Reference';

    interactionResourceViewerTitle
      .textContent = resourceTitle;

    interactionResourceViewerImage.src =
      resourceSource;

    interactionResourceViewerImage.alt =
      interactionResourceButton.dataset
        .resourceAlt ||
      resourceTitle;

    interactionResourceViewer.hidden = false;
    interactionResourceViewerClose.focus();
  }


  function closeInteractionResource() {

    interactionResourceViewer.hidden = true;

    if (!interactionResourceButton.hidden) {
      interactionResourceButton.focus();
    }
  }


  function updateQuestionContent() {

    const questions =
      activeQuestionTimestamp === 11600 ?
        timestampFourQuestions :
        (
          activeQuestionTimestamp === 12100 ?
            timestampFiveQuestions :
            timestampOneQuestions
        );

    const questionNumber =
      questionContentIndex + 1;

    const questionCount =
      questions.length;

    questionContentText.textContent =
      questions[
        questionContentIndex
      ];

    questionContentProgressText.textContent =
      `QUESTION ${questionNumber} OF ${questionCount}`;

    questionContentProgress.setAttribute(
      'aria-valuenow',
      String(questionNumber)
    );

    questionContentProgress.setAttribute(
      'aria-valuemax',
      String(questionCount)
    );

    questionContentProgressFill.style.width =
      `${(
        questionNumber / questionCount
      ) * 100}%`;

    questionContentNext.textContent =
      questionNumber === questionCount ?
        'BACK TO FIRST' :
        'NEXT QUESTION';
  }


  function updateDescentManagementQuestion(
    questionIndex
  ) {

    descentManagementQuestionIndex =
      Math.min(
        Math.max(questionIndex, 0),
        timestampThreeQuestions.length - 1
      );

    const question =
      timestampThreeQuestions[
        descentManagementQuestionIndex
      ];

    questionContentText.textContent =
      question.text;

    questionContentChoiceButtons.forEach(
      (button, answerIndex) => {
        button.textContent =
          question.answers[answerIndex];

        button.setAttribute(
          'aria-pressed',
          'false'
        );

        delete button.dataset.result;

        if (
          answerIndex ===
            question.correctAnswerIndex
        ) {
          button.dataset.correct = 'true';
        } else {
          delete button.dataset.correct;
        }
      }
    );

    descentManagementQuestionSlider.value =
      String(
        descentManagementQuestionIndex + 1
      );

    questionContentProgressText.textContent =
      `QUESTION ${
        descentManagementQuestionIndex + 1
      } OF ${timestampThreeQuestions.length}`;

    descentManagementVideo.pause();

    if (question.hasVideo) {
      if (
        descentManagementVideo.getAttribute(
          'src'
        ) !== question.videoSrc
      ) {
        descentManagementVideo.setAttribute(
          'src',
          question.videoSrc
        );

        descentManagementVideo.load();
      } else {
        descentManagementVideo.currentTime = 0;
      }
    } else {
      descentManagementVideo.currentTime = 0;
    }

    descentManagementVideo.hidden =
      !question.hasVideo;
  }


  function setQuestionContentAvailable(
    isAvailable,
    timestamp = 1000
  ) {

    questionContentButton.disabled =
      !isAvailable;

    if (isAvailable) {
      activeQuestionTimestamp = timestamp;

      questionContentButton.setAttribute(
        'data-pulse',
        'true'
      );
    } else {
      activeQuestionTimestamp = null;

      questionContentButton.removeAttribute(
        'data-pulse'
      );

      descentManagementVideo.pause();
      descentManagementVideo.currentTime = 0;
      descentManagementVideo.hidden = true;
      questionContentOverlay.hidden = true;
    }

    questionContentButton.setAttribute(
      'aria-label',
      isAvailable ?
        `Open timestamp ${String(
          forcedPauseTimes.indexOf(timestamp) + 1
        ).padStart(2, '0')} questions` :
        'Question, not yet available'
    );
  }


  function openQuestionContent() {

    if (questionContentButton.disabled) {
      return;
    }

    questionContentButton.removeAttribute(
      'data-pulse'
    );

    const isDescentManagementQuestion =
      activeQuestionTimestamp === 9000;

    const isIceQuestion =
      activeQuestionTimestamp === 11600;

    const isTcasQuestion =
      activeQuestionTimestamp === 12100;

    questionContentNumber.textContent =
      isDescentManagementQuestion ?
        '03' :
        (
          isIceQuestion ?
            '04' :
            (isTcasQuestion ? '05' : '01')
        );

    questionContentNumber.setAttribute(
      'aria-label',
      isDescentManagementQuestion ?
        'Interaction number 03' :
        (
          isIceQuestion ?
            'Interaction number 04' :
            (
              isTcasQuestion ?
                'Interaction number 05' :
                'Interaction number 01'
            )
        )
    );

    questionContentTitle.textContent =
      isDescentManagementQuestion ?
        'Descent Management' :
        (
          isIceQuestion ?
            'Ice' :
            (isTcasQuestion ? 'TCAS' : 'Questions')
        );

    questionContentNext.hidden =
      isDescentManagementQuestion ||
      isIceQuestion;

    questionContentProgressRow.hidden = false;

    questionContentProgress.hidden =
      isDescentManagementQuestion;

    descentManagementQuestionSlider.hidden =
      !isDescentManagementQuestion;

    questionContentChoices.hidden =
      !isDescentManagementQuestion;

    if (isDescentManagementQuestion) {
      updateDescentManagementQuestion(0);
    } else {
      descentManagementVideo.pause();
      descentManagementVideo.currentTime = 0;
      descentManagementVideo.hidden = true;
      questionContentIndex = 0;
      updateQuestionContent();
    }

    questionContentOverlay.hidden = false;

    if (isDescentManagementQuestion) {
      questionContentChoiceButtons[0].focus();
    } else {
      questionContentNext.focus();
    }
  }


  function closeQuestionContent() {

    descentManagementVideo.pause();
    questionContentOverlay.hidden = true;
    questionContentButton.focus();
  }


  function showNextQuestion() {

    const questions =
      activeQuestionTimestamp === 11600 ?
        timestampFourQuestions :
        (
          activeQuestionTimestamp === 12100 ?
            timestampFiveQuestions :
            timestampOneQuestions
        );

    questionContentIndex =
      (
        questionContentIndex + 1
      ) % questions.length;

    updateQuestionContent();
  }


  function selectQuestionChoice(event) {

    questionContentChoiceButtons.forEach(
      button => {
        button.setAttribute(
          'aria-pressed',
          String(button === event.currentTarget)
        );

        delete button.dataset.result;
      }
    );

    const selectedButton =
      event.currentTarget;

    const isCorrect =
      selectedButton.dataset.correct ===
        'true';

    selectedButton.dataset.result =
      isCorrect ?
        'correct' :
        'incorrect';

    const activeDescentQuestion =
      timestampThreeQuestions[
        descentManagementQuestionIndex
      ];

    const shouldShowVideo =
      activeQuestionTimestamp === 9000 &&
      activeDescentQuestion.hasVideo;

    descentManagementVideo.pause();
    descentManagementVideo.currentTime = 0;
    descentManagementVideo.hidden =
      !shouldShowVideo;

    if (isCorrect && shouldShowVideo) {
      const videoPlayback =
        descentManagementVideo.play();

      if (videoPlayback) {
        videoPlayback.catch(() => {});
      }
    }
  }


  function selectDescentManagementQuestion() {

    updateDescentManagementQuestion(
      Number(
        descentManagementQuestionSlider.value
      ) - 1
    );
  }


  function showQuestionAfterVideo() {

    if (
      activeQuestionTimestamp !== 9000 ||
      descentManagementQuestionIndex >=
        timestampThreeQuestions.length - 1
    ) {
      return;
    }

    updateDescentManagementQuestion(
      descentManagementQuestionIndex + 1
    );
    questionContentChoiceButtons[0].focus();
  }


  function setReferenceContentAvailable(
    isAvailable,
    timestamp = 4000
  ) {

    referenceContentButton.disabled =
      !isAvailable;

    if (isAvailable) {
      activeReferenceTimestamp = timestamp;

      referenceContentButton.setAttribute(
        'data-pulse',
        'true'
      );
    } else {
      activeReferenceTimestamp = null;

      referenceContentButton.removeAttribute(
        'data-pulse'
      );

      referenceContentOverlay.hidden = true;
    }

    referenceContentButton.setAttribute(
      'aria-label',
      isAvailable ?
        `Open timestamp ${String(
          forcedPauseTimes.indexOf(timestamp) + 1
        ).padStart(2, '0')} reference material` :
        'Reference material, not yet available'
    );
  }


  function openReferenceContent() {

    if (referenceContentButton.disabled) {
      return;
    }

    referenceContentButton.removeAttribute(
      'data-pulse'
    );

    const interactionNumber =
      forcedPauseTimes.indexOf(
        activeReferenceTimestamp
      ) + 1;

    const interactionLabel =
      String(interactionNumber)
        .padStart(2, '0');

    const references =
      timestampReferences[
        activeReferenceTimestamp
      ] || [];

    referenceContentNumber.textContent =
      interactionLabel;

    referenceContentNumber.setAttribute(
      'aria-label',
      `Interaction number ${interactionLabel}`
    );

    referenceContentIntro.textContent =
      'Consider the following:';

    referenceContentList.replaceChildren();

    references.forEach(reference => {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      const text = document.createElement('span');

      label.textContent = `${reference.label}:`;
      text.textContent = reference.text;

      item.append(label, text);
      referenceContentList.append(item);
    });

    referenceContentOverlay.hidden = false;
    referenceContentClose.focus();
  }


  function closeReferenceContent() {

    referenceContentOverlay.hidden = true;
    referenceContentButton.focus();
  }


  function setToggleState(
    button,
    isVisible
  ) {

    button.setAttribute(
      'aria-pressed',
      isVisible ? 'true' : 'false'
    );
  }


  function setMagentaRoutesVisible(
    isVisible
  ) {

    const visibility =
      isVisible ? 'visible' : 'none';

    [
      'teltu1n-line',
      'zagzo1q-line',
      'zagzo1q-points'
    ].forEach(layerId => {

      map.setLayoutProperty(
        layerId,
        'visibility',
        visibility
      );
    });

    teltu1nWaypointElements
      .forEach(element => {
        element.style.display =
          isVisible ? '' : 'none';
      });

    setToggleState(
      magentaRouteToggle,
      isVisible
    );
  }


  function setVerticalProfileVisible(
    isVisible
  ) {

    verticalProfilePanel.hidden =
      !isVisible;

    setToggleState(
      verticalProfileToggle,
      isVisible
    );

    if (pfdPanel) {
      pfdPanel.setAttribute(
        'data-profile-visible',
        isVisible ? 'true' : 'false'
      );
    }
  }


  function setPfdVisible(isVisible) {

    if (!pfdPanel || !pfdToggle) {
      return;
    }

    pfdPanel.hidden = !isVisible;

    setToggleState(
      pfdToggle,
      isVisible
    );

    if (isVisible && latestPfdState) {
      drawPrimaryFlightDisplay(
        latestPfdState
      );
    }
  }


  magentaRouteToggle.addEventListener(
    'click',
    () => {
      magentaRoutesVisible =
        !magentaRoutesVisible;

      setMagentaRoutesVisible(
        magentaRoutesVisible
      );
    }
  );

  verticalProfileToggle.addEventListener(
    'click',
    () => {
      verticalProfileVisible =
        !verticalProfileVisible;

      setVerticalProfileVisible(
        verticalProfileVisible
      );
    }
  );

  if (pfdToggle) {
    pfdToggle.addEventListener(
      'click',
      () => {
        pfdVisible = !pfdVisible;

        setPfdVisible(pfdVisible);
      }
    );
  }


  addControlMenuBehaviour(
    displayMenuToggle,
    displayMenuContent
  );

  addControlMenuBehaviour(
    flightBagMenuToggle,
    flightBagMenuContent
  );

  flightBagWeatherButton.addEventListener(
    'click',
    openFlightBagWeather
  );

  flightBagWeatherClose.addEventListener(
    'click',
    closeFlightBagWeather
  );

  flightBagWeatherOverlay.addEventListener(
    'click',
    event => {
      if (event.target === flightBagWeatherOverlay) {
        closeFlightBagWeather();
      }
    }
  );

  flightBagLidoButton.addEventListener(
    'click',
    openFlightBagLido
  );

  flightBagLidoClose.addEventListener(
    'click',
    closeFlightBagLido
  );

  flightBagLidoOverlay.addEventListener(
    'click',
    event => {
      if (event.target === flightBagLidoOverlay) {
        closeFlightBagLido();
      }
    }
  );

  lidoPlateChoices.forEach(
    plateButton => {
      plateButton.addEventListener(
        'click',
        () => openLidoPlate(plateButton)
      );
    }
  );

  lidoPlateViewerClose.addEventListener(
    'click',
    closeLidoPlateViewer
  );

  interactionResourceButton.addEventListener(
    'click',
    openInteractionResource
  );

  interactionResourceViewerClose
    .addEventListener(
      'click',
      closeInteractionResource
    );

  questionContentButton.addEventListener(
    'click',
    openQuestionContent
  );

  questionContentNext.addEventListener(
    'click',
    showNextQuestion
  );

  questionContentChoiceButtons.forEach(
    button => button.addEventListener(
      'click',
      selectQuestionChoice
    )
  );

  descentManagementQuestionSlider
    .addEventListener(
      'input',
      selectDescentManagementQuestion
    );

  descentManagementVideo.addEventListener(
    'ended',
    showQuestionAfterVideo
  );

  questionContentClose.addEventListener(
    'click',
    closeQuestionContent
  );

  questionContentOverlay.addEventListener(
    'click',
    event => {
      if (event.target === questionContentOverlay) {
        closeQuestionContent();
      }
    }
  );

  referenceContentButton.addEventListener(
    'click',
    openReferenceContent
  );

  referenceContentClose.addEventListener(
    'click',
    closeReferenceContent
  );

  referenceContentOverlay.addEventListener(
    'click',
    event => {
      if (event.target === referenceContentOverlay) {
        closeReferenceContent();
      }
    }
  );

  document.addEventListener(
    'keydown',
    event => {

      if (event.key !== 'Escape') {
        return;
      }

      if (!referenceContentOverlay.hidden) {
        closeReferenceContent();
        return;
      }

      if (!questionContentOverlay.hidden) {
        closeQuestionContent();
        return;
      }

      if (!interactionResourceViewer.hidden) {
        closeInteractionResource();
        return;
      }

      if (!lidoPlateViewer.hidden) {
        closeLidoPlateViewer();
        return;
      }

      if (!flightBagLidoOverlay.hidden) {
        closeFlightBagLido();
        return;
      }

      if (!flightBagWeatherOverlay.hidden) {
        closeFlightBagWeather();
      }
    }
  );


  setMagentaRoutesVisible(true);
  setVerticalProfileVisible(true);
  setPfdVisible(false);


  // ==========================================
  // PLAYBACK HELPERS
  // ==========================================

  function interpolate(
    start,
    end,
    progress
  ) {

    return start +
      (end - start) *
      progress;
  }


  function interpolateDirection(
    start,
    end,
    progress
  ) {

    const change =
      ((end - start + 540) % 360) - 180;

    return (
      start + change * progress + 360
    ) % 360;
  }


  const teltuProfileWaypoint =
    (scenario.waypoints || [])
      .find(
        waypoint => waypoint.name === 'TELTU'
      );

  function createProfileData(track) {

    const startTimestamp =
      track[0].timestamp;

    const endTimestamp =
      track[track.length - 1].timestamp;

    const duration =
      endTimestamp - startTimestamp;

    const maximumAltitude =
      Math.max(
        ...track.map(
          point => point.altitude
        ),
        1
      );

    const teltuConstraint =
      teltuProfileWaypoint ?
        (() => {

          const longitudeScale =
            Math.cos(
              teltuProfileWaypoint.position[1] *
                Math.PI / 180
            );

          const closestTrackPoint =
            track.reduce(
              (closest, point) => {

                const longitudeDifference =
                  (
                    point.position[0] -
                    teltuProfileWaypoint.position[0]
                  ) * longitudeScale;

                const latitudeDifference =
                  point.position[1] -
                  teltuProfileWaypoint.position[1];

                const distanceSquared =
                  longitudeDifference *
                    longitudeDifference +
                  latitudeDifference *
                    latitudeDifference;


                return distanceSquared <
                  closest.distanceSquared ?
                    {
                      point,
                      distanceSquared
                    } :
                    closest;
              },
              {
                point: track[0],
                distanceSquared: Infinity
              }
            ).point;

          const flightLevel =
            Number.parseInt(
              (teltuProfileWaypoint.level || '')
                .replace('FL', ''),
              10
            );


          return {
            name: teltuProfileWaypoint.name,
            level: teltuProfileWaypoint.level,
            altitude:
              Number.isFinite(flightLevel) ?
                flightLevel * 100 :
                closestTrackPoint.altitude,
            progress:
              duration === 0 ?
                0 :
                (closestTrackPoint.timestamp -
                  startTimestamp) /
                  duration
          };
        })() :
        null;

    return {
      track,
      startTimestamp,
      duration,
      maximumAltitude,
      teltuConstraint
    };
  }


  const primaryProfileData =
    createProfileData(flightTrack);

  const secondProfileData =
    createProfileData(secondFlightTrack);

  const thirdProfileData =
    createProfileData(thirdFlightTrack);

  let activeProfileData =
    primaryProfileData;


  function profileCanvasPosition(
    progress,
    altitude
  ) {

    const padding = {
      top: 16,
      right: 14,
      bottom: 14,
      left: 14
    };

    const plotWidth =
      verticalProfileCanvas.width -
      padding.left -
      padding.right;

    const plotHeight =
      verticalProfileCanvas.height -
      padding.top -
      padding.bottom;


    return [
      padding.left +
        progress * plotWidth,
      padding.top +
        (1 - altitude /
          activeProfileData.maximumAltitude) *
        plotHeight
    ];
  }


  function drawVerticalProfile(
    playbackProgress,
    altitude
  ) {

    const context =
      verticalProfileContext;

    const {
      track,
      startTimestamp,
      duration,
      maximumAltitude,
      teltuConstraint
    } = activeProfileData;

    const canvasWidth =
      verticalProfileCanvas.width;

    const canvasHeight =
      verticalProfileCanvas.height;


    context.clearRect(
      0,
      0,
      canvasWidth,
      canvasHeight
    );


    context.strokeStyle =
      'rgba(100, 109, 120, 0.14)';

    context.lineWidth = 1;

    [0.25, 0.5, 0.75]
      .forEach(gridProgress => {

        const gridY =
          profileCanvasPosition(
            0,
            maximumAltitude *
              gridProgress
          )[1];

        context.beginPath();
        context.moveTo(14, gridY);
        context.lineTo(
          canvasWidth - 14,
          gridY
        );
        context.stroke();
      });


    const profilePositions =
      track.map(point => {

        const progress =
          duration === 0 ?
            0 :
            (point.timestamp -
              startTimestamp) /
              duration;

        return profileCanvasPosition(
          progress,
          point.altitude
        );
      });


    context.beginPath();
    context.moveTo(
      profilePositions[0][0],
      canvasHeight - 14
    );

    profilePositions.forEach(
      position => {
        context.lineTo(
          position[0],
          position[1]
        );
      }
    );

    context.lineTo(
      profilePositions[
        profilePositions.length - 1
      ][0],
      canvasHeight - 14
    );

    context.closePath();
    context.fillStyle =
      'rgba(198, 95, 152, 0.11)';
    context.fill();


    context.beginPath();
    profilePositions.forEach(
      (position, index) => {

        if (index === 0) {
          context.moveTo(
            position[0],
            position[1]
          );
          return;
        }

        context.lineTo(
          position[0],
          position[1]
        );
      }
    );

    context.strokeStyle = '#c65f98';
    context.lineWidth = 4;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.stroke();


    if (teltuConstraint) {

      const constraintPosition =
        profileCanvasPosition(
          teltuConstraint.progress,
          teltuConstraint.altitude
        );

      context.beginPath();
      context.moveTo(
        constraintPosition[0],
        constraintPosition[1] - 7
      );
      context.lineTo(
        constraintPosition[0] + 7,
        constraintPosition[1]
      );
      context.lineTo(
        constraintPosition[0],
        constraintPosition[1] + 7
      );
      context.lineTo(
        constraintPosition[0] - 7,
        constraintPosition[1]
      );
      context.closePath();
      context.fillStyle = '#c65f98';
      context.fill();

      context.fillStyle = '#85456a';
      context.font = '700 18px Arial';
      context.textBaseline = 'bottom';
      context.fillText(
        `${teltuConstraint.name}  ` +
          teltuConstraint.level,
        constraintPosition[0] + 12,
        constraintPosition[1] - 8
      );
    }


    const currentPosition =
      profileCanvasPosition(
        playbackProgress,
        altitude
      );

    context.beginPath();
    context.arc(
      currentPosition[0],
      currentPosition[1],
      7,
      0,
      Math.PI * 2
    );
    context.fillStyle = '#ffffff';
    context.fill();
    context.strokeStyle = '#c65f98';
    context.lineWidth = 5;
    context.stroke();


    const displayAltitude =
      Math.round(altitude / 100) * 100;

    const formattedAltitude =
      displayAltitude
        .toLocaleString('en-GB');

    verticalProfileAltitude.textContent =
      `${formattedAltitude} FT`;

    verticalProfileCanvas.setAttribute(
      'aria-label',
      'Recorded vertical flight profile. ' +
      `Current altitude ${formattedAltitude} ` +
      'feet. TELTU restriction FL190.'
    );
  }


  // ==========================================
  // PRIMARY FLIGHT DISPLAY
  // ==========================================

  function normaliseHeading(heading) {

    return (
      (heading % 360) + 360
    ) % 360;
  }


  function directionChange(
    start,
    end
  ) {

    return (
      (end - start + 540) % 360
    ) - 180;
  }


  function standardAtmosphereAt(
    altitudeFeet
  ) {

    const altitudeMetres =
      Math.max(altitudeFeet, 0) *
      0.3048;

    const seaLevelTemperature = 288.15;
    const seaLevelPressure = 101325;
    const gravity = 9.80665;
    const gasConstant = 287.05287;
    const lapseRate = 0.0065;
    const tropopauseHeight = 11000;
    const gamma = 1.4;

    let temperature;
    let pressure;


    if (altitudeMetres <= tropopauseHeight) {

      temperature =
        seaLevelTemperature -
        lapseRate * altitudeMetres;

      pressure =
        seaLevelPressure *
        Math.pow(
          temperature /
            seaLevelTemperature,
          gravity /
            (gasConstant * lapseRate)
        );

    } else {

      const tropopauseTemperature =
        seaLevelTemperature -
        lapseRate * tropopauseHeight;

      const tropopausePressure =
        seaLevelPressure *
        Math.pow(
          tropopauseTemperature /
            seaLevelTemperature,
          gravity /
            (gasConstant * lapseRate)
        );

      temperature =
        tropopauseTemperature;

      pressure =
        tropopausePressure *
        Math.exp(
          -gravity *
          (altitudeMetres -
            tropopauseHeight) /
          (gasConstant * temperature)
        );
    }


    return {
      temperature,
      pressure,
      speedOfSound:
        Math.sqrt(
          gamma *
          gasConstant *
          temperature
        )
    };
  }


  function simulatedAirData(
    groundSpeedKnots,
    altitudeFeet
  ) {

    const gamma = 1.4;
    const gasConstant = 287.05287;
    const seaLevelTemperature = 288.15;
    const seaLevelPressure = 101325;
    const metresPerSecondPerKnot =
      0.514444;

    // No wind data is available in the recording.
    // This light tailwind model gives a plausible
    // A321 cruise Mach while reducing to zero at
    // the runway.
    const assumedTailwindKnots =
      Math.min(
        Math.max(
          altitudeFeet / 36000 * 25,
          0
        ),
        25
      );

    const trueAirspeedMetresPerSecond =
      Math.max(
        groundSpeedKnots -
          assumedTailwindKnots,
        0
      ) * metresPerSecondPerKnot;

    const atmosphere =
      standardAtmosphereAt(
        altitudeFeet
      );

    const mach =
      trueAirspeedMetresPerSecond /
      atmosphere.speedOfSound;

    const impactPressure =
      atmosphere.pressure *
      (
        Math.pow(
          1 +
          (gamma - 1) / 2 *
          mach * mach,
          gamma / (gamma - 1)
        ) - 1
      );

    const seaLevelSpeedOfSound =
      Math.sqrt(
        gamma *
        gasConstant *
        seaLevelTemperature
      );

    const calibratedAirspeedMetresPerSecond =
      seaLevelSpeedOfSound *
      Math.sqrt(
        2 / (gamma - 1) *
        (
          Math.pow(
            impactPressure /
              seaLevelPressure + 1,
            (gamma - 1) / gamma
          ) - 1
        )
      );


    return {
      mach,
      calibratedAirspeed:
        calibratedAirspeedMetresPerSecond /
        metresPerSecondPerKnot,
      assumedTailwindKnots
    };
  }


  function flightDisplayMotion(
    start,
    end
  ) {

    const duration =
      Math.max(
        end.timestamp - start.timestamp,
        0.1
      );

    const verticalSpeed =
      (end.altitude - start.altitude) /
      duration * 60;

    const averageSpeedMetresPerSecond =
      Math.max(
        (start.speed + end.speed) / 2 *
          0.514444,
        1
      );

    const turnRateRadiansPerSecond =
      directionChange(
        start.direction,
        end.direction
      ) /
      duration * Math.PI / 180;

    const bank =
      Math.atan(
        turnRateRadiansPerSecond *
        averageSpeedMetresPerSecond /
        9.80665
      ) * 180 / Math.PI;

    const verticalSpeedMetresPerSecond =
      verticalSpeed * 0.00508;

    const pitch =
      Math.atan2(
        verticalSpeedMetresPerSecond,
        averageSpeedMetresPerSecond
      ) * 180 / Math.PI;

    const startCalibratedAirspeed =
      simulatedAirData(
        start.speed,
        start.altitude
      ).calibratedAirspeed;

    const endCalibratedAirspeed =
      simulatedAirData(
        end.speed,
        end.altitude
      ).calibratedAirspeed;

    const speedTrend =
      (endCalibratedAirspeed -
        startCalibratedAirspeed) /
      duration * 10;


    return {
      verticalSpeed,
      speedTrend,
      bank: Math.min(
        Math.max(bank, -30),
        30
      ),
      pitch: Math.min(
        Math.max(pitch, -12),
        12
      )
    };
  }


  function updatePrimaryFlightDisplay(state) {

    latestPfdState = state;

    if (pfdVisible) {
      drawPrimaryFlightDisplay(state);
    }
  }


  function updatePfdForTrackStart(
    track,
    title
  ) {

    const firstPoint = track[0];

    const motion =
      flightDisplayMotion(
        firstPoint,
        track[1]
      );

    updatePrimaryFlightDisplay({
      title,
      altitude: firstPoint.altitude,
      speed: firstPoint.speed,
      direction: firstPoint.direction,
      selectedAltitude: null,
      verticalMode: 'ALT',
      ...motion
    });
  }


  function drawPrimaryFlightDisplay(state) {

    const context = pfdContext;

    const displaySize = 300;

    const scale =
      pfdCanvas.width / displaySize;

    const colours = {
      black: '#020405',
      cyan: '#00d4d7',
      yellow: '#e4e800',
      white: '#d8dde3',
      grey: '#29303b',
      blue: '#08759e',
      brown: '#5b3508',
      green: '#00df35',
      selectedBlue: '#4aa8ff'
    };

    const attitude = {
      x: 150,
      y: 155,
      radius: 78
    };

    const airData =
      simulatedAirData(
        state.speed,
        state.altitude
      );

    const displaySpeed =
      airData.calibratedAirspeed;

    const displayAltitude =
      state.verticalMode === 'ALT' &&
      Math.abs(state.altitude - 36000) <
        300 ?
        36000 :
        Math.round(state.altitude / 10) *
        10;


    context.setTransform(
      scale,
      0,
      0,
      scale,
      0,
      0
    );

    context.clearRect(
      0,
      0,
      displaySize,
      displaySize
    );

    context.fillStyle = colours.black;
    context.fillRect(
      0,
      0,
      displaySize,
      displaySize
    );

    context.textBaseline = 'middle';


    // FLIGHT MODE ANNUNCIATOR

    const flightMode =
      state.verticalMode ||
      (
        state.verticalSpeed < -300 ?
          'DES' :
          state.verticalSpeed > 300 ?
            'CLB' :
            'ALT'
      );

    context.strokeStyle =
      'rgba(216, 221, 227, 0.7)';
    context.lineWidth = 1;

    [60, 122, 184, 246]
      .forEach(x => {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 36);
        context.stroke();
      });

    context.fillStyle = colours.green;
    context.font = '11px Arial';
    context.textAlign = 'center';
    context.fillText(
      flightMode,
      91,
      22
    );

    context.fillText(
      'NAV',
      153,
      22
    );

    context.fillStyle = colours.white;
    context.font = '12px Arial';
    context.textAlign = 'right';
    context.fillText(
      '1 FD 2',
      292,
      22
    );


    // ATTITUDE SPHERE

    context.save();
    context.beginPath();
    context.arc(
      attitude.x,
      attitude.y,
      attitude.radius,
      0,
      Math.PI * 2
    );
    context.clip();

    context.translate(
      attitude.x,
      attitude.y
    );

    context.rotate(
      -state.bank * Math.PI / 180
    );

    context.translate(
      0,
      state.pitch * 3
    );

    context.fillStyle = colours.blue;
    context.fillRect(
      -180,
      -180,
      360,
      180
    );

    context.fillStyle = colours.brown;
    context.fillRect(
      -180,
      0,
      360,
      180
    );

    context.strokeStyle = colours.white;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(-160, 0);
    context.lineTo(160, 0);
    context.stroke();

    [-20, -15, -10, -5, 5, 10, 15, 20]
      .forEach(pitchMark => {

        const y = -pitchMark * 3;

        const longMark =
          pitchMark % 10 === 0;

        const halfWidth =
          longMark ? 24 : 13;

        context.lineWidth =
          longMark ? 1.5 : 1;

        context.beginPath();
        context.moveTo(-halfWidth, y);
        context.lineTo(halfWidth, y);
        context.stroke();

        if (longMark) {
          context.fillStyle = colours.white;
          context.font = '9px Arial';
          context.textAlign = 'center';
          context.fillText(
            Math.abs(pitchMark),
            -34,
            y
          );
          context.fillText(
            Math.abs(pitchMark),
            34,
            y
          );
        }
      });

    context.restore();

    context.strokeStyle = colours.white;
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(
      attitude.x,
      attitude.y,
      attitude.radius,
      Math.PI,
      Math.PI * 2
    );
    context.stroke();


    // BANK SCALE AND POINTER

    [-45, -30, -20, -10, 0, 10, 20, 30, 45]
      .forEach(bankMark => {

        const angle =
          (-90 + bankMark) *
          Math.PI / 180;

        const innerRadius =
          bankMark % 30 === 0 ?
            83 : 86;

        context.beginPath();
        context.moveTo(
          attitude.x +
            Math.cos(angle) *
            innerRadius,
          attitude.y +
            Math.sin(angle) *
            innerRadius
        );
        context.lineTo(
          attitude.x +
            Math.cos(angle) * 91,
          attitude.y +
            Math.sin(angle) * 91
        );
        context.stroke();
      });

    context.save();
    context.translate(
      attitude.x,
      attitude.y
    );
    context.rotate(
      state.bank * Math.PI / 180
    );
    context.fillStyle = colours.yellow;
    context.beginPath();
    context.moveTo(0, -92);
    context.lineTo(-6, -82);
    context.lineTo(6, -82);
    context.closePath();
    context.strokeStyle = colours.yellow;
    context.lineWidth = 2;
    context.stroke();
    context.restore();


    // FIXED AIRCRAFT REFERENCE

    context.strokeStyle = colours.yellow;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(82, attitude.y);
    context.lineTo(114, attitude.y);
    context.lineTo(114, attitude.y + 9);
    context.lineTo(124, attitude.y + 9);
    context.lineTo(124, attitude.y);
    context.moveTo(218, attitude.y);
    context.lineTo(186, attitude.y);
    context.lineTo(186, attitude.y + 9);
    context.lineTo(176, attitude.y + 9);
    context.lineTo(176, attitude.y);
    context.stroke();

    context.strokeStyle = colours.white;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(143, attitude.y);
    context.lineTo(157, attitude.y);
    context.moveTo(150, attitude.y - 7);
    context.lineTo(150, attitude.y + 7);
    context.stroke();


    // AIRSPEED TAPE

    const tapeTop = 88;
    const tapeBottom = 230;
    const tapeCentre = 159;

    context.fillStyle = colours.grey;
    context.fillRect(
      3,
      tapeTop,
      43,
      tapeBottom - tapeTop
    );

    context.strokeStyle = colours.white;
    context.lineWidth = 1;
    context.strokeRect(
      3,
      tapeTop,
      43,
      tapeBottom - tapeTop
    );

    context.save();
    context.beginPath();
    context.rect(
      3,
      tapeTop,
      54,
      tapeBottom - tapeTop
    );
    context.clip();

    const speedBase =
      Math.round(displaySpeed / 10) * 10;

    for (
      let tapeSpeed = speedBase - 70;
      tapeSpeed <= speedBase + 70;
      tapeSpeed += 10
    ) {

      if (tapeSpeed < 0) {
        continue;
      }

      const y =
        tapeCentre +
        (displaySpeed - tapeSpeed) * 1.1;

      context.beginPath();
      context.moveTo(37, y);
      context.lineTo(
        tapeSpeed % 20 === 0 ?
          46 : 42,
        y
      );
      context.stroke();

      if (tapeSpeed % 20 === 0) {
        context.fillStyle = colours.white;
        context.font = '11px Arial';
        context.textAlign = 'right';
        context.fillText(
          String(tapeSpeed).padStart(3, '0'),
          34,
          y
        );
      }
    }

    context.restore();

    context.strokeStyle = colours.yellow;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, tapeCentre);
    context.lineTo(47, tapeCentre);
    context.lineTo(54, tapeCentre - 5);
    context.lineTo(54, tapeCentre + 5);
    context.closePath();
    context.stroke();

    if (Math.abs(state.speedTrend || 0) >= 2) {

      const speedTrendY =
        tapeCentre -
        Math.min(
          Math.max(
            state.speedTrend,
            -55
          ),
          55
        ) * 1.1;

      context.beginPath();
      context.moveTo(54, tapeCentre);
      context.lineTo(54, speedTrendY);
      context.lineTo(
        state.speedTrend > 0 ?
          51 : 57,
        speedTrendY +
          (state.speedTrend > 0 ?
            5 : -5)
      );
      context.stroke();
    }

    if (airData.mach > 0.5) {

      context.fillStyle = colours.green;
      context.font = '11px Arial';
      context.textAlign = 'left';
      context.fillText(
        airData.mach
          .toFixed(2)
          .replace(/^0/, ''),
        4,
        244
      );
    }


    // ALTITUDE TAPE

    context.fillStyle = colours.grey;
    context.fillRect(
      251,
      tapeTop,
      43,
      tapeBottom - tapeTop
    );

    context.strokeStyle = colours.white;
    context.lineWidth = 1;
    context.strokeRect(
      251,
      tapeTop,
      43,
      tapeBottom - tapeTop
    );

    context.save();
    context.beginPath();
    context.rect(
      238,
      tapeTop,
      56,
      tapeBottom - tapeTop
    );
    context.clip();

    const altitudeBase =
      Math.round(displayAltitude / 100) *
      100;

    for (
      let tapeAltitude =
        altitudeBase - 1200;
      tapeAltitude <=
        altitudeBase + 1200;
      tapeAltitude += 100
    ) {

      if (tapeAltitude < 0) {
        continue;
      }

      const y =
        tapeCentre +
        (displayAltitude - tapeAltitude) *
          0.07;

      context.beginPath();
      context.moveTo(251, y);
      context.lineTo(
        tapeAltitude % 1000 === 0 ?
          261 : 257,
        y
      );
      context.stroke();

      if (tapeAltitude % 1000 === 0) {
        context.fillStyle = colours.white;
        context.font = '10px Arial';
        context.textAlign = 'right';
        context.fillText(
          Math.round(tapeAltitude / 100)
            .toString()
            .padStart(3, '0'),
          248,
          y
        );
      }
    }

    context.restore();

    context.fillStyle = colours.grey;
    context.fillRect(
      226,
      tapeCentre - 13,
      68,
      26
    );
    context.strokeStyle = colours.yellow;
    context.lineWidth = 1.5;
    context.strokeRect(
      226,
      tapeCentre - 13,
      68,
      26
    );
    context.fillStyle = colours.green;
    context.font = '16px Arial';
    context.textAlign = 'right';
    context.fillText(
      Math.floor(
        Math.max(
          0,
          displayAltitude
        ) / 100
      ).toString().padStart(3, '0'),
      272,
      tapeCentre
    );

    context.font = '10px Arial';
    context.fillText(
      String(
        Math.max(
          0,
          displayAltitude
        ) % 100
      ).padStart(2, '0'),
      291,
      tapeCentre
    );

    if (
      Number.isFinite(
        state.selectedAltitude
      )
    ) {

      const selectedAltitudeY =
        tapeCentre +
        (displayAltitude -
          state.selectedAltitude) *
          0.07;

      context.fillStyle =
        colours.selectedBlue;

      context.strokeStyle =
        colours.selectedBlue;

      context.lineWidth = 2;

      if (
        selectedAltitudeY >= tapeTop &&
        selectedAltitudeY <= tapeBottom
      ) {

        context.beginPath();
        context.moveTo(248, selectedAltitudeY);
        context.lineTo(242, selectedAltitudeY);
        context.lineTo(242, selectedAltitudeY + 5);
        context.stroke();

      } else {

        const targetLabelY =
          state.selectedAltitude <
            displayAltitude ?
            tapeBottom + 13 :
            tapeTop - 13;

        context.font = '10px Arial';
        context.textAlign = 'right';
        context.fillText(
          `FL${Math.round(
            state.selectedAltitude / 100
          )}`,
          247,
          targetLabelY
        );

        context.beginPath();
        context.arc(
          255,
          state.selectedAltitude <
            displayAltitude ?
            tapeBottom + 1 :
            tapeTop - 1,
          4,
          Math.PI,
          0
        );
        context.fill();
      }
    }


    // VERTICAL SPEED

    function verticalSpeedScaleOffset(value) {

      const direction =
        value < 0 ? -1 : 1;

      const magnitude =
        Math.min(
          Math.abs(value),
          6000
        );

      let offset;


      if (magnitude <= 1000) {
        offset = magnitude / 1000 * 20;
      } else if (magnitude <= 2000) {
        offset =
          20 +
          (magnitude - 1000) /
            1000 * 15;
      } else {
        offset =
          35 +
          (magnitude - 2000) /
            4000 * 23;
      }


      return direction * offset;
    }

    const verticalSpeedY =
      tapeCentre -
      verticalSpeedScaleOffset(
        state.verticalSpeed
      );

    context.strokeStyle = colours.white;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(298, tapeTop);
    context.lineTo(298, tapeBottom);
    context.stroke();

    for (
      let verticalSpeedMark = -6000;
      verticalSpeedMark <= 6000;
      verticalSpeedMark += 500
    ) {

        const y =
          tapeCentre -
          verticalSpeedScaleOffset(
            verticalSpeedMark
          );

        context.beginPath();
        context.moveTo(
          Math.abs(verticalSpeedMark) %
            1000 === 0 ?
            289 : 293,
          y
        );
        context.lineTo(298, y);
        context.stroke();

        if (
          [1000, 2000, 6000]
            .includes(
              Math.abs(verticalSpeedMark)
            )
        ) {

          context.fillStyle = colours.white;
          context.font = '8px Arial';
          context.textAlign = 'right';
          context.fillText(
            Math.abs(
              verticalSpeedMark / 1000
            ),
            288,
            y
          );
        }
    }

    context.strokeStyle = colours.green;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(298, tapeCentre);
    context.lineTo(282, verticalSpeedY);
    context.stroke();

    if (Math.abs(state.verticalSpeed) >= 200) {

      context.fillStyle = colours.green;
      context.font = '10px Arial';
      context.textAlign = 'right';
      context.fillText(
        Math.abs(
          Math.round(
            state.verticalSpeed / 100
          )
        ),
        280,
        Math.min(
          Math.max(
            verticalSpeedY,
            tapeTop + 7
          ),
          tapeBottom - 7
        )
      );
    }


    // HEADING TAPE

    context.fillStyle = colours.grey;
    context.fillRect(60, 260, 180, 34);
    context.strokeStyle = colours.white;
    context.lineWidth = 1;
    context.strokeRect(60, 260, 180, 34);

    context.save();
    context.beginPath();
    context.rect(60, 260, 180, 34);
    context.clip();

    const headingBase =
      Math.round(state.direction / 5) * 5;

    for (
      let tapeHeading = headingBase - 40;
      tapeHeading <= headingBase + 40;
      tapeHeading += 5
    ) {

      const x =
        150 +
        (tapeHeading - state.direction) *
          2.25;

      const headingValue =
        normaliseHeading(tapeHeading);

      context.beginPath();
      context.moveTo(x, 260);
      context.lineTo(
        x,
        tapeHeading % 10 === 0 ?
          269 : 265
      );
      context.stroke();

      if (tapeHeading % 10 === 0) {
        context.fillStyle = colours.white;
        context.font = '10px Arial';
        context.textAlign = 'center';
        context.fillText(
          String(
            Math.round(headingValue / 10)
          ).padStart(2, '0'),
          x,
          282
        );
      }
    }

    context.restore();

    context.strokeStyle = colours.yellow;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(150, 250);
    context.lineTo(150, 265);
    context.stroke();

    context.fillStyle = colours.cyan;
    context.font = '11px Arial';
    context.textAlign = 'center';
    context.fillText(
      String(
        Math.round(
          normaliseHeading(
            state.direction
          )
        )
      ).padStart(3, '0'),
      82,
      248
    );


    pfdFlightLabel.textContent =
      state.title;

    pfdCanvas.setAttribute(
      'aria-label',
      'Primary flight display. ' +
      `Calibrated airspeed ${Math.round(displaySpeed)} knots, ` +
      `altitude ${displayAltitude} feet, ` +
      (
        airData.mach > 0.5 ?
          `Mach ${airData.mach.toFixed(2)}, ` :
          ''
      ) +
      (
        Number.isFinite(
          state.selectedAltitude
        ) ?
          `selected flight level ${Math.round(
            state.selectedAltitude / 100
          )}, ` :
          ''
      ) +
      `vertical mode ${flightMode}, ` +
      `heading ${Math.round(state.direction)} degrees, ` +
      `vertical speed ${Math.round(state.verticalSpeed)} ` +
      'feet per minute.'
    );
  }


  function formatUtcTime(timestamp) {

    return new Date(timestamp * 1000)
      .toISOString()
      .slice(11, 16);
  }


  function updateFlightInformation(
    flightTitle,
    timestamp,
    altitude,
    speed,
    progress
  ) {

    stageName.textContent =
      flightTitle;

    stageText.textContent =
      `${formatUtcTime(timestamp)} UTC • ` +
      `${Math.round(altitude).toLocaleString('en-GB')} ft • ` +
      `GS ${Math.round(speed)} kt • ` +
      `${Math.round(progress * 100)}%`;
  }


  // ==========================================
  // FLIGHT PLAYBACK
  // ==========================================

  let isPlaying = false;
  let hasPlayed = false;
  let isPlaybackPaused = false;
  let sequenceElapsedMilliseconds = 0;
  let activeForcedPauseTime = null;
  let activePlaybackRunId = 0;
  let transportSeekTarget = null;
  let transportSeekRouteQueue = [];
  let routeChoiceHistory = [];

  const simulationSpeedMultiplier =
    1.6;

  const forcedPauseTimes = [
    1,
    4,
    9,
    11.6,
    12.1,
    13.5,
    16,
    20.5,
    23.7,
    25.8,
    31.5,
    35,
    37.8,
    44,
    51,
    54,
    57,
    60,
    65
  ].map(seconds => seconds * 1000);

  const timedInteractionContent = {
    1000: {
      title: 'Descent prep.',
      text:
        'The aircraft is commencing a standard arrival having recently been handed over to London FIR. You are at your cruise altitude of 36000ft.\n\n' +
        'Descent preparation and briefing should be completed before top of descent, under low work load. Consider the briefing guide below - it’s worth noting the whilst the briefing is split to PM and PF points, BOTH pilots must understand the complete picture:',
      resource: {
        title: 'Arrival Briefing Guide',
        src:
          'assets/arrival-briefing-guide.png?v=20260828-1',
        alt:
          'Wizz Air Arrival Briefing Guide'
      }
    },
    9000: {
      title: 'Descent Management',
      text:
        'Sometimes, best laid plans don’t work out. Descent management can be a multi-pronged approach, meaning more than one method may be required to achieve the desired vertical flight path.\n\n' +
        'Program the FMGC you want it, taking into account ATC and Fly guide expectations. Treat it as your script, but be ready to ad-lib when the situation changes.'
    },
    11600: {
      title: 'Ice',
      text:
        'Ice can be a factor all year round. Use the aircraft’s systems as per the FCOM. In summary:\n\n' +
        '• Visible moisture at or below 10 °C (TAT in flight; SAT on the ground).\n\n' +
        '• At any time during the descent, engine A/I must be used if in visible moisture.\n\n' +
        'Remember, it’s ANTI-ICING. Proactive use before entering an area of icing conditions is best practice.',
      embed: {
        title: 'Interactive anti-ice controls and ECAM display',
        src:
          'assets/anti-ice-training.html?v=20260828-4'
      }
    },
    12100: {
      title: 'TCAS',
      text:
        'Congested airspace needs careful management and Traffic Alerts or Resolution Advisories can occur frequently. Always survey the airspace as you navigate your way.\n\n' +
        'Consider:\n\n' +
        '• Adjusting the map range to view nearby aircraft.\n\n' +
        '• Adhering to rates of climb or descent when nearing your selected FCU level.',
      embed: {
        title: 'Interactive TCAS threat sequence',
        src:
          'assets/tcas-threat-sequence.html?v=20260829-3',
        placement: 'below',
        size: 'compact'
      }
    }
  };

  let nextForcedPauseIndex = 0;

  const commonFlightTrack =
    flightTrack.slice(
      0,
      primaryTeltuIndex + 1
    );

  const commonRouteCoordinates =
    routeCoordinates.slice(
      0,
      primaryTeltuIndex + 1
    );

  const playedFlightChoices =
    new Set();

  let pendingInteractionContinuation =
    null;


  function progressAtTrackIndex(
    track,
    pointIndex
  ) {

    const firstTimestamp =
      track[0].timestamp;

    const duration =
      track[track.length - 1].timestamp -
      firstTimestamp;

    return duration === 0 ?
      0 :
      (
        track[pointIndex].timestamp -
        firstTimestamp
      ) / duration;
  }


  const primaryTeltuProgress =
    progressAtTrackIndex(
      flightTrack,
      primaryTeltuIndex
    );

  const secondTeltuProgress =
    progressAtTrackIndex(
      secondFlightTrack,
      primaryTeltuIndex
    );

  const thirdTeltuProgress =
    progressAtTrackIndex(
      thirdFlightTrack,
      primaryTeltuIndex
    );


  const flightChoices = {
    one: {
      key: 'one',
      button: flightChoiceOne,
      label: `ROUTE 1 · ${scenario.title}`,
      title: scenario.title,
      track: flightTrack,
      coordinates: routeCoordinates,
      completedSourceId: 'route-completed',
      aheadSourceId: 'route-ahead',
      profileData: primaryProfileData,
      descentElement: topOfDescentElement,
      descentProgress: topOfDescentProgress,
      descentSelectionProgress,
      teltuProgress: primaryTeltuProgress,
      playbackDuration:
        scenario.playbackDuration || 45000
    },
    two: {
      key: 'two',
      button: flightChoiceTwo,
      label: `ROUTE 2 · ${secondFlight.title}`,
      title: secondFlight.title,
      track: secondFlightTrack,
      coordinates: secondRouteCoordinates,
      completedSourceId:
        'route-two-completed',
      aheadSourceId: 'route-two-ahead',
      profileData: secondProfileData,
      descentElement:
        secondTopOfDescentElement,
      descentProgress:
        secondTopOfDescentProgress,
      descentSelectionProgress:
        secondDescentSelectionProgress,
      teltuProgress: secondTeltuProgress,
      playbackDuration:
        secondFlight.playbackDuration || 45000
    },
    three: {
      key: 'three',
      button: flightChoiceThree,
      label:
        `ROUTE 3 · ${thirdFlight.title} · GO-AROUND`,
      title: thirdFlight.title,
      track: thirdFlightTrack,
      coordinates: thirdRouteCoordinates,
      completedSourceId:
        'route-three-completed',
      aheadSourceId: null,
      profileData: thirdProfileData,
      descentElement:
        thirdTopOfDescentElement,
      descentProgress:
        thirdTopOfDescentProgress,
      descentSelectionProgress:
        thirdDescentSelectionProgress,
      teltuProgress: thirdTeltuProgress,
      playbackDuration:
        thirdFlight.playbackDuration || 45000
    }
  };


  function updateFlightChoiceButtons() {

    Object.values(flightChoices)
      .forEach(choice => {

        const hasPlayedChoice =
          playedFlightChoices.has(
            choice.key
          );

        choice.button.disabled =
          hasPlayedChoice;

        choice.button.setAttribute(
          'data-played',
          hasPlayedChoice ?
            'true' :
            'false'
        );

        choice.button.textContent =
          choice.label +
          (
            hasPlayedChoice ?
              ' · COMPLETE' :
              ''
          );
      });
  }


  function hideFlightChoicePanel() {

    flightChoicePanel.hidden = true;
    nextButton.hidden = false;
  }


  function hideInteractionPause() {

    interactionPausePanel.hidden = true;
    interactionPauseNumber.hidden = true;
    interactionPauseKicker.hidden = false;
    interactionPausePanel.setAttribute(
      'data-accent',
      'default'
    );
    interactionPausePanel.setAttribute(
      'data-has-embed',
      'false'
    );
    interactionPausePanel.setAttribute(
      'data-embed-size',
      'default'
    );
    interactionEmbed.hidden = true;
    interactionEmbed.removeAttribute('src');
    interactionResourceButton.hidden = true;
    interactionResourceViewer.hidden = true;
    descentModesPrompt.hidden = true;
    delete descentModesPrompt.dataset.action;
    descentModesOverlay.hidden = true;

    descentModesVideo.pause();
    descentModesVideo.currentTime = 0;

    pendingInteractionContinuation = null;
  }


  function showInteractionPause(
    message,
    onContinue
  ) {

    isPlaying = false;
    activeForcedPauseTime = null;
    setPlaybackPaused(false);
    pauseButton.disabled = true;
    updateTransportNavigation();

    flightChoicePanel.hidden = true;
    nextButton.hidden = true;

    interactionPauseKicker.textContent =
      'FLIGHT COMPLETE';

    interactionPauseKicker.hidden = false;

    interactionPausePanel.setAttribute(
      'data-accent',
      'default'
    );

    interactionPauseNumber.hidden = true;

    interactionPauseTitle.textContent =
      'Simulation paused';

    interactionPausePanel.setAttribute(
      'data-long-content',
      'false'
    );

    interactionPausePanel.setAttribute(
      'data-has-embed',
      'false'
    );
    interactionPausePanel.setAttribute(
      'data-embed-size',
      'default'
    );

    interactionEmbed.hidden = true;
    interactionEmbed.removeAttribute('src');

    interactionPauseText.textContent =
      message;

    interactionResourceButton.hidden = true;
    interactionResourceViewer.hidden = true;

    pendingInteractionContinuation =
      onContinue;

    interactionPausePanel.hidden = false;
  }


  function showTimedInteractionPause(
    pauseTime
  ) {

    const interactionNumber =
      forcedPauseTimes.indexOf(
        pauseTime
      ) + 1;

    const interactionLabel =
      String(interactionNumber)
        .padStart(2, '0');

    const interactionContent =
      timedInteractionContent[pauseTime] ||
      {};

    activeForcedPauseTime = pauseTime;
    setPlaybackPaused(true);
    pauseButton.disabled = true;
    updateTransportNavigation();

    if (
      pauseTime === 1000 ||
      pauseTime === 9000 ||
      pauseTime === 11600 ||
      pauseTime === 12100
    ) {
      setQuestionContentAvailable(
        true,
        pauseTime
      );
    }

    if (
      pauseTime === 4000 ||
      pauseTime === 11600
    ) {
      setReferenceContentAvailable(
        true,
        pauseTime
      );
    }

    flightChoicePanel.hidden = true;
    nextButton.hidden = true;

    interactionPauseKicker.textContent =
      'INTERACTION POINT';

    const usesMagentaStyle =
      pauseTime === 1000 ||
      pauseTime === 9000 ||
      pauseTime === 11600 ||
      pauseTime === 12100;

    interactionPauseKicker.hidden =
      usesMagentaStyle;

    interactionPausePanel.setAttribute(
      'data-accent',
      usesMagentaStyle ?
        'magenta' :
        'default'
    );

    interactionPauseNumber.textContent =
      interactionLabel;

    interactionPauseNumber.hidden = false;

    interactionPauseTitle.textContent =
      interactionContent.title ||
      formatPlaybackTime(pauseTime);

    interactionPauseText.textContent =
      interactionContent.text ||
      'Select CONTINUE when you are ready to resume.';

    const interactionEmbedContent =
      interactionContent.embed;

    interactionPausePanel.setAttribute(
      'data-has-embed',
      interactionEmbedContent ?
        'true' :
        'false'
    );

    interactionPausePanel.setAttribute(
      'data-embed-size',
      interactionEmbedContent &&
        interactionEmbedContent.size ===
          'compact' ?
        'compact' :
        'default'
    );

    if (
      interactionEmbedContent &&
      interactionEmbedContent.placement ===
        'below'
    ) {
      interactionPauseText.after(
        interactionEmbed
      );
    } else {
      interactionPauseTitle.after(
        interactionEmbed
      );
    }

    interactionEmbed.hidden =
      !interactionEmbedContent;

    if (interactionEmbedContent) {
      interactionEmbed.title =
        interactionEmbedContent.title;

      interactionEmbed.src =
        interactionEmbedContent.src;
    } else {
      interactionEmbed.title =
        'Interactive training content';

      interactionEmbed.removeAttribute('src');
    }

    const interactionResource =
      interactionContent.resource;

    interactionResourceViewer.hidden = true;
    interactionResourceButton.hidden =
      !interactionResource;

    if (interactionResource) {
      interactionResourceThumbnail.src =
        interactionResource.src;

      interactionResourceThumbnail.alt =
        interactionResource.alt ||
        interactionResource.title;

      interactionResourceButton.dataset
        .resourceTitle =
          interactionResource.title;

      interactionResourceButton.dataset
        .resourceSrc =
          interactionResource.src;

      interactionResourceButton.dataset
        .resourceAlt =
          interactionResource.alt ||
          interactionResource.title;

      interactionResourceButton.setAttribute(
        'aria-label',
        `Open ${interactionResource.title}`
      );
    } else {
      interactionResourceThumbnail
        .removeAttribute('src');

      interactionResourceThumbnail.alt = '';

      delete interactionResourceButton.dataset
        .resourceTitle;

      delete interactionResourceButton.dataset
        .resourceSrc;

      delete interactionResourceButton.dataset
        .resourceAlt;
    }

    interactionPausePanel.setAttribute(
      'data-long-content',
      interactionContent.text ?
        'true' :
        'false'
    );

    pendingInteractionContinuation =
      () => {
        activeForcedPauseTime = null;

        if (
          pauseTime === 1000 ||
          pauseTime === 9000 ||
          pauseTime === 11600 ||
          pauseTime === 12100
        ) {
          setQuestionContentAvailable(false);
        }

        if (
          pauseTime === 4000 ||
          pauseTime === 11600
        ) {
          setReferenceContentAvailable(false);
        }

        setPlaybackPaused(false);
        pauseButton.disabled = false;
        nextButton.hidden = false;
        updateTransportNavigation();
      };

    if (
      pauseTime === 1000 ||
      pauseTime === 4000 ||
      pauseTime === 9000 ||
      pauseTime === 11600 ||
      pauseTime === 12100
    ) {
      interactionPausePanel.hidden = true;

      const isDescentPrep =
        pauseTime === 1000;

      const isDescentModes =
        pauseTime === 4000;

      const isIce =
        pauseTime === 11600;

      const isTcas =
        pauseTime === 12100;

      descentModesPrompt.dataset.action =
        isDescentModes ?
          'open-descent-modes' :
          'open-interaction';

      descentModesPrompt.textContent =
        isDescentPrep ?
          'DESCENT PREP' :
          (
            isDescentModes ?
              'DESCENT MODES' :
              (
                isIce ?
                  'ICE' :
                  (
                    isTcas ?
                      'TCAS' :
                      'DESCENT MANAGEMENT'
                  )
              )
          );

      descentModesPrompt.setAttribute(
        'aria-label',
        isDescentPrep ?
          'Open Descent prep interaction' :
          (
            isDescentModes ?
              'Open Descent modes interaction' :
              (
                isIce ?
                  'Open Ice interaction' :
                  (
                    isTcas ?
                      'Open TCAS interaction' :
                      'Open Descent Management interaction'
                  )
              )
          )
      );

      if (isDescentModes) {
        descentModesNumber.textContent =
          interactionLabel;
      }

      descentModesPrompt.hidden = false;
      descentModesPrompt.focus();
      return;
    }

    delete descentModesPrompt.dataset.action;
    descentModesPrompt.hidden = true;
    interactionPausePanel.hidden = false;
  }


  function showFlightChoicePanel(
    allFlightsComplete = false
  ) {

    const remainingChoices =
      Object.keys(flightChoices).length -
      playedFlightChoices.size;

    isPlaying = false;
    setPlaybackPaused(false);
    pauseButton.disabled = true;

    updateFlightChoiceButtons();

    hideInteractionPause();

    flightChoiceText.textContent =
      allFlightsComplete ?
        'All three routes have been completed.' :
        `${remainingChoices} route${
          remainingChoices === 1 ? '' : 's'
        } available. Choose the next outcome.`;

    flightChoicePanel.hidden = false;

    if (allFlightsComplete) {
      nextButton.hidden = false;
      nextButton.disabled = false;
      nextButton.textContent = 'REPLAY';
    } else {
      nextButton.hidden = true;
    }
  }


  function formatPlaybackTime(milliseconds) {

    const elapsedTenths =
      Math.max(
        0,
        Math.floor(milliseconds / 100)
      );

    const minutes =
      Math.floor(elapsedTenths / 600);

    const seconds =
      Math.floor(
        (elapsedTenths % 600) / 10
      );

    const tenths =
      elapsedTenths % 10;


    return (
      `${String(minutes).padStart(2, '0')}:` +
      `${String(seconds).padStart(2, '0')}.` +
      `${tenths}`
    );
  }


  function updatePlaybackTimer() {

    const timerText =
      formatPlaybackTime(
        sequenceElapsedMilliseconds
      );

    updateTransportNavigation();

    if (playbackTimer.textContent === timerText) {
      return;
    }

    playbackTimer.textContent = timerText;
  }


  function setPlaybackPaused(isPaused) {

    isPlaybackPaused = isPaused;

    const shouldShowPause =
      isPlaying && !isPaused;

    pauseButton.setAttribute(
      'aria-pressed',
      isPaused ? 'true' : 'false'
    );

    playbackToggleSymbol.textContent =
      shouldShowPause ? 'Ⅱ' : '▶';

    const buttonLabel =
      shouldShowPause ?
        'Pause simulation' :
        'Play simulation';

    pauseButton.setAttribute(
      'aria-label',
      buttonLabel
    );

    pauseButton.title =
      shouldShowPause ? 'Pause' : 'Play';
  }


  function previousForcedPauseTime() {

    if (activeForcedPauseTime !== null) {
      const activeIndex =
        forcedPauseTimes.indexOf(
          activeForcedPauseTime
        );

      return activeIndex > 0 ?
        forcedPauseTimes[activeIndex - 1] :
        null;
    }

    for (
      let index =
        forcedPauseTimes.length - 1;
      index >= 0;
      index--
    ) {
      if (
        forcedPauseTimes[index] <=
          sequenceElapsedMilliseconds
      ) {
        return forcedPauseTimes[index];
      }
    }

    return null;
  }


  function nextForcedPauseTime() {

    if (activeForcedPauseTime !== null) {
      const activeIndex =
        forcedPauseTimes.indexOf(
          activeForcedPauseTime
        );

      return (
        activeIndex >= 0 &&
        activeIndex <
          forcedPauseTimes.length - 1
      ) ?
        forcedPauseTimes[activeIndex + 1] :
        null;
    }

    return forcedPauseTimes.find(
      pauseTime =>
        pauseTime >
          sequenceElapsedMilliseconds
    ) ?? null;
  }


  function updateTransportNavigation() {

    previousTimestampButton.disabled =
      previousForcedPauseTime() === null;

    nextTimestampButton.disabled =
      nextForcedPauseTime() === null;
  }


  function seekToForcedPause(pauseTime) {

    if (
      pauseTime === null ||
      !forcedPauseTimes.includes(pauseTime)
    ) {
      return;
    }

    const savedRouteHistory =
      routeChoiceHistory.slice();

    resetPlayback({
      preserveRouteHistory: true
    });

    routeChoiceHistory =
      savedRouteHistory;

    transportSeekTarget =
      pauseTime;

    transportSeekRouteQueue =
      savedRouteHistory.slice();

    nextForcedPauseIndex =
      forcedPauseTimes.indexOf(
        pauseTime
      );

    playCommonLeg({
      isTransportReplay: true
    });
  }


  function resetPlayback({
    preserveRouteHistory = false
  } = {}) {

    const firstPoint =
      flightTrack[0];

    activePlaybackRunId++;
    isPlaying = false;
    activeForcedPauseTime = null;

    transportSeekTarget = null;
    transportSeekRouteQueue = [];

    if (!preserveRouteHistory) {
      routeChoiceHistory = [];
    }

    playedFlightChoices.clear();
    nextForcedPauseIndex = 0;
    setQuestionContentAvailable(false);
    questionContentOverlay.hidden = true;
    questionContentIndex = 0;
    updateQuestionContent();
    setReferenceContentAvailable(false);
    referenceContentOverlay.hidden = true;
    hideFlightChoicePanel();
    hideInteractionPause();
    updateFlightChoiceButtons();

    aircraftMarker
      .setLngLat(firstPoint.position)
      .setRotation(firstPoint.direction);

    activeProfileData =
      primaryProfileData;

    resetCamera();

    updateRouteProgress(
      0,
      firstPoint.position,
      commonRouteCoordinates,
      'route-completed',
      'route-ahead'
    );

    hideSecondRoute();

    hideThirdRoute();

    setPrimaryRouteActive(true);

    restoreSecondRouteStyle();

    restoreThirdRouteStyle();

    resetHeathrowTraffic();

    topOfDescentElement.style.visibility =
      'visible';

    updateTopOfDescentVisibility(0);

    secondTopOfDescentElement.style.visibility =
      'hidden';

    secondTopOfDescentElement.style.opacity =
      '0';

    thirdTopOfDescentElement.style.visibility =
      'hidden';

    thirdTopOfDescentElement.style.opacity =
      '0';

    drawVerticalProfile(
      0,
      firstPoint.altitude
    );

    stageName.textContent =
      'TELTU Route Selection';

    stageText.textContent =
      'Press PLAY to fly to TELTU and choose a route.';

    nextButton.textContent =
      'PLAY';

    nextButton.disabled = false;

    sequenceElapsedMilliseconds = 0;
    updatePlaybackTimer();

    setPlaybackPaused(false);
    pauseButton.disabled = false;

    hasPlayed = false;
  }


  function playFlight({
    track,
    coordinates,
    completedSourceId,
    aheadSourceId,
    profileData,
    descentElement,
    descentProgress,
    descentSelectionProgress,
    routePointIndexOffset = 0,
    flightProgressStart = 0,
    flightProgressEnd = 1,
    title,
    playbackDuration,
    buttonText,
    onComplete
  }) {

    activeProfileData =
      profileData;

    const playbackRunId =
      ++activePlaybackRunId;

    const firstTimestamp =
      track[0].timestamp;

    const lastTimestamp =
      track[track.length - 1]
        .timestamp;

    const trackDuration =
      lastTimestamp - firstTimestamp;

    const animationStart =
      performance.now();

    const sequenceElapsedAtFlightStart =
      sequenceElapsedMilliseconds;

    const playbackStartOffset =
      transportSeekTarget === null ?
        0 :
        Math.min(
          Math.max(
            transportSeekTarget -
              sequenceElapsedAtFlightStart,
            0
          ),
          playbackDuration
        );

    let pointIndex = 0;

    let pauseStartedAt = null;

    let pausedDuration = 0;

    let lastDetailUpdateTime =
      -Infinity;

    const detailUpdateInterval =
      1000 /
        (
          useLightweightMobileAnimation ?
            15 :
            30
        );


    isPlaying = true;
    pauseButton.disabled = false;
    nextButton.disabled = true;
    nextButton.textContent = buttonText;
    setPlaybackPaused(false);


    function frame(now) {

      if (playbackRunId !== activePlaybackRunId) {
        return;
      }

      if (isPlaybackPaused) {

        if (pauseStartedAt === null) {
          pauseStartedAt = now;
        }

        requestAnimationFrame(frame);
        return;
      }

      if (pauseStartedAt !== null) {

        pausedDuration +=
          now - pauseStartedAt;

        pauseStartedAt = null;
      }

      const rawFlightElapsed =
        Math.min(
          playbackStartOffset +
            now - animationStart -
            pausedDuration,
          playbackDuration
        );

      let flightElapsed =
        rawFlightElapsed;

      let forcedPauseTime = null;

      const nextForcedPauseTime =
        forcedPauseTimes[
          nextForcedPauseIndex
        ];

      if (
        nextForcedPauseTime !== undefined &&
        nextForcedPauseTime >
          sequenceElapsedAtFlightStart &&
        nextForcedPauseTime <=
          sequenceElapsedAtFlightStart +
            rawFlightElapsed
      ) {

        forcedPauseTime =
          nextForcedPauseTime;

        flightElapsed =
          forcedPauseTime -
          sequenceElapsedAtFlightStart;

        pausedDuration +=
          rawFlightElapsed -
          flightElapsed;
      }

      const playbackProgress =
        Math.min(
          flightElapsed /
            playbackDuration,
          1
        );

      const flightProgress =
        interpolate(
          flightProgressStart,
          flightProgressEnd,
          playbackProgress
        );

      sequenceElapsedMilliseconds =
        sequenceElapsedAtFlightStart +
        flightElapsed;

      updatePlaybackTimer();

      const trackTimestamp =
        firstTimestamp +
        trackDuration * playbackProgress;


      while (
        pointIndex <
          track.length - 2 &&
        track[pointIndex + 1]
          .timestamp <= trackTimestamp
      ) {
        pointIndex++;
      }


      const start =
        track[pointIndex];

      const end =
        track[pointIndex + 1];

      const segmentDuration =
        end.timestamp - start.timestamp;

      const segmentProgress =
        segmentDuration === 0 ?
          1 :
          Math.min(
            Math.max(
              (trackTimestamp -
                start.timestamp) /
                segmentDuration,
              0
            ),
            1
          );


      const position = [
        interpolate(
          start.position[0],
          end.position[0],
          segmentProgress
        ),
        interpolate(
          start.position[1],
          end.position[1],
          segmentProgress
        )
      ];

      const altitude =
        interpolate(
          start.altitude,
          end.altitude,
          segmentProgress
        );

      const speed =
        interpolate(
          start.speed,
          end.speed,
          segmentProgress
        );

      const direction =
        interpolateDirection(
          start.direction,
          end.direction,
          segmentProgress
        );


      aircraftMarker
        .setLngLat(position)
        .setRotation(direction);

      trackAircraft(
        position,
        flightProgress,
        now,
        descentProgress
      );

      updateHeathrowTraffic(
        flightProgress
      );

      updateTopOfDescentVisibility(
        flightProgress,
        descentElement,
        descentProgress
      );

      if (
        playbackProgress === 1 ||
        now - lastDetailUpdateTime >=
          detailUpdateInterval
      ) {

        lastDetailUpdateTime = now;

        updateRouteProgress(
          pointIndex +
            routePointIndexOffset,
          position,
          coordinates,
          completedSourceId,
          aheadSourceId
        );

        updateFlightInformation(
          title,
          trackTimestamp,
          altitude,
          speed,
          flightProgress
        );

        drawVerticalProfile(
          flightProgress,
          altitude
        );

      }


      if (forcedPauseTime !== null) {

        nextForcedPauseIndex++;

        if (
          transportSeekTarget ===
            forcedPauseTime
        ) {
          transportSeekTarget = null;
          transportSeekRouteQueue = [];
        }

        showTimedInteractionPause(
          forcedPauseTime
        );

        requestAnimationFrame(frame);

      } else if (playbackProgress < 1) {

        requestAnimationFrame(
          frame
        );

      } else {

        isPlaying = false;
        onComplete();
      }
    }


    requestAnimationFrame(
      frame
    );
  }


  function completeFlightSequence() {

    isPlaying = false;
    hasPlayed = true;

    setPlaybackPaused(false);
    pauseButton.disabled = true;

    stageName.textContent =
      'All Flights Complete';

    stageText.textContent =
      'All three TELTU outcomes have been explored.';

    showFlightChoicePanel(true);
  }


  function returnToTeltuSelection() {

    if (
      transportSeekTarget !== null &&
      transportSeekRouteQueue.length > 0
    ) {
      const nextChoiceKey =
        transportSeekRouteQueue.shift();

      playSelectedFlight(
        nextChoiceKey,
        {
          isTransportReplay: true
        }
      );
      return;
    }

    const teltuPoint =
      flightTrack[primaryTeltuIndex];

    aircraftMarker
      .setLngLat(teltuPoint.position)
      .setRotation(teltuPoint.direction);

    activeProfileData =
      primaryProfileData;

    resetCamera();

    topOfDescentElement.style.visibility =
      'hidden';

    secondTopOfDescentElement.style.visibility =
      'hidden';

    thirdTopOfDescentElement.style.visibility =
      'hidden';

    drawVerticalProfile(
      primaryTeltuProgress,
      teltuPoint.altitude
    );

    stageName.textContent =
      'TELTU · Choose Route';

    stageText.textContent =
      'Select one of the remaining recorded outcomes.';

    showFlightChoicePanel();
  }


  function completeSelectedFlight(
    choiceKey
  ) {

    playedFlightChoices.add(choiceKey);
    softenCompletedRoute(choiceKey);

    if (transportSeekTarget !== null) {
      const nextChoiceKey =
        transportSeekRouteQueue.shift();

      if (nextChoiceKey) {
        playSelectedFlight(
          nextChoiceKey,
          {
            isTransportReplay: true
          }
        );
      } else {
        showFlightChoicePanel();
      }

      return;
    }

    isPlaying = false;
    setPlaybackPaused(false);
    pauseButton.disabled = true;

    const choice =
      flightChoices[choiceKey];

    const allFlightsComplete =
      playedFlightChoices.size ===
      Object.keys(flightChoices).length;

    stageName.textContent =
      `${choice.title} Complete`;

    stageText.textContent =
      'Select CONTINUE when you are ready.';

    showInteractionPause(
      allFlightsComplete ?
        `${choice.title} has finished. Continue to complete the exercise.` :
        `${choice.title} has finished. Continue to return to TELTU.`,
      allFlightsComplete ?
        completeFlightSequence :
        returnToTeltuSelection
    );
  }


  function playSelectedFlight(
    choiceKey,
    {
      isTransportReplay = false
    } = {}
  ) {

    if (
      isPlaying ||
      (
        !isTransportReplay &&
        playedFlightChoices.has(choiceKey)
      )
    ) {
      return;
    }

    if (!isTransportReplay) {
      routeChoiceHistory =
        routeChoiceHistory.slice(
          0,
          playedFlightChoices.size
        );

      routeChoiceHistory.push(
        choiceKey
      );
    }

    const choice =
      flightChoices[choiceKey];

    const teltuPoint =
      choice.track[primaryTeltuIndex];

    hideFlightChoicePanel();

    if (choiceKey === 'one') {
      setPrimaryRouteActive(true);
    } else if (choiceKey === 'two') {
      restoreSecondRouteStyle();
    } else {
      restoreThirdRouteStyle();
    }

    aircraftMarker
      .setLngLat(teltuPoint.position)
      .setRotation(teltuPoint.direction);

    activeProfileData =
      choice.profileData;

    resetCamera();
    resetHeathrowTraffic();

    [
      topOfDescentElement,
      secondTopOfDescentElement,
      thirdTopOfDescentElement
    ].forEach(element => {
      element.style.visibility = 'hidden';
      element.style.opacity = '0';
    });

    choice.descentElement.style.visibility =
      'visible';

    updateTopOfDescentVisibility(
      choice.teltuProgress,
      choice.descentElement,
      choice.descentProgress
    );

    updateRouteProgress(
      primaryTeltuIndex,
      teltuPoint.position,
      choice.coordinates,
      choice.completedSourceId,
      choice.aheadSourceId
    );

    drawVerticalProfile(
      choice.teltuProgress,
      teltuPoint.altitude
    );

    const branchTrack =
      choice.track.slice(
        primaryTeltuIndex
      );

    const branchPlaybackDuration =
      Math.max(
        1000,
        choice.playbackDuration *
          (1 - choice.teltuProgress) /
          simulationSpeedMultiplier
      );

    playFlight({
      track: branchTrack,
      coordinates: choice.coordinates,
      completedSourceId:
        choice.completedSourceId,
      aheadSourceId:
        choice.aheadSourceId,
      profileData: choice.profileData,
      descentElement:
        choice.descentElement,
      descentProgress:
        choice.descentProgress,
      descentSelectionProgress:
        choice.descentSelectionProgress,
      routePointIndexOffset:
        primaryTeltuIndex,
      flightProgressStart:
        choice.teltuProgress,
      flightProgressEnd: 1,
      title: choice.title,
      playbackDuration:
        branchPlaybackDuration,
      buttonText: choice.label,
      onComplete: () =>
        completeSelectedFlight(choiceKey)
    });
  }


  function playCommonLeg() {

    const commonPlaybackDuration =
      Math.max(
        1000,
        (scenario.playbackDuration || 45000) *
          primaryTeltuProgress /
          simulationSpeedMultiplier
      );

    playFlight({
      track: commonFlightTrack,
      coordinates: commonRouteCoordinates,
      completedSourceId: 'route-completed',
      aheadSourceId: 'route-ahead',
      profileData: primaryProfileData,
      descentElement: topOfDescentElement,
      descentProgress: topOfDescentProgress,
      descentSelectionProgress,
      flightProgressStart: 0,
      flightProgressEnd:
        primaryTeltuProgress,
      title: scenario.title,
      playbackDuration:
        commonPlaybackDuration,
      buttonText: 'TO TELTU',
      onComplete: returnToTeltuSelection
    });
  }


  nextButton.addEventListener(
    'click',
    () => {

      if (isPlaying) {
        return;
      }

      if (hasPlayed) {
        resetPlayback();
      }

      playCommonLeg();
    }
  );


  flightChoiceOne.addEventListener(
    'click',
    () => playSelectedFlight('one')
  );

  flightChoiceTwo.addEventListener(
    'click',
    () => playSelectedFlight('two')
  );

  flightChoiceThree.addEventListener(
    'click',
    () => playSelectedFlight('three')
  );


  descentModesPrompt.addEventListener(
    'click',
    () => {

      const promptAction =
        descentModesPrompt.dataset.action;

      descentModesPrompt.hidden = true;

      if (promptAction === 'open-interaction') {
        interactionPausePanel.hidden = false;

        if (!interactionResourceButton.hidden) {
          interactionResourceButton.focus();
        } else {
          interactionContinueButton.focus();
        }

        return;
      }

      descentModesOverlay.hidden = false;

      descentModesVideo.currentTime = 0;

      const videoPlayback =
        descentModesVideo.play();

      if (videoPlayback) {
        videoPlayback.catch(() => {});
      }
    }
  );


  descentModesClose.addEventListener(
    'click',
    () => {

      const continuation =
        pendingInteractionContinuation;

      descentModesVideo.pause();
      descentModesOverlay.hidden = true;
      pendingInteractionContinuation = null;

      if (continuation) {
        continuation();
      }
    }
  );


  interactionContinueButton.addEventListener(
    'click',
    () => {

      const continuation =
        pendingInteractionContinuation;

      if (!continuation) {
        return;
      }

      hideInteractionPause();
      continuation();
    }
  );


  pauseButton.addEventListener(
    'click',
    () => {

      if (!isPlaying) {
        if (hasPlayed) {
          resetPlayback();
        }

        playCommonLeg();
        return;
      }

      setPlaybackPaused(
        !isPlaybackPaused
      );
    }
  );


  restartButton.addEventListener(
    'click',
    () => {
      resetPlayback();
      pauseButton.focus();
    }
  );


  previousTimestampButton.addEventListener(
    'click',
    () => {
      seekToForcedPause(
        previousForcedPauseTime()
      );
    }
  );


  nextTimestampButton.addEventListener(
    'click',
    () => {
      seekToForcedPause(
        nextForcedPauseTime()
      );
    }
  );


  resetPlayback();
});
