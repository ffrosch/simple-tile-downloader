Make a plan to create this new feature.

Guidelines:

- Adhere to current patterns and standards of the codebase
- Keep it simple (KISS): make the new feature as simple as possible, but as complex as necessary
- Don't create tests
- keep code clean and use the single responsibility principle

Further Instructions:

- process and - if necessary - complement and improve them
- ask for clarification where necessary
- use multiple experts to process, review and improve the requirements
- use mulitple passes to finalize the requirements

## feature: support WMTS services

- query getCapabilities
  - get supported EPSG-codes from
  - get supported formats
  - get supported layers
  - get supported tilematrixlimits for each tilematrixset
- update processTilesConfig
  - automatically determine whether url is xyz or wmts
  - make a test request to check whether the determined type xyz or wmts actually works, if not throw an error that the type of service could not be automatically detected
  - add an optional parameter that takes the type of service (xyz or wmts) as argument
  - add a parameter for LAYER, which can not be provded if the service is xyz, but must be provided if the service is wmts
- wmts-url-generation parameters
  - SERVICE=WMTS (if not present in url)
  - REQUEST=GetTile (if not present in url)
  - LAYER (if not present in url)
  - FORMAT (if not present in url, default: image/jpeg)
  - TILEMATRIXSET (equals "crs", default: EPSG:3857)
  - TILEMATRIX (equals "z")
  - TILEROW (equals "y")
  - TILECOL (equals "x")
- validation of chosen parameter arguments by checking getCapabilities, throw error if not available
  - LAYER available?
  - FORMAT available?
  - TILEMATRIXSET available?
  - range of TILEMATRIXMIN to TILEMATRIXMAX available?
- example-url for getCapabilities: http://localhost/ogc/?SERVICE=WMTS&REQUEST=GetCapabilities
- example-url for tile request: http://localhost/ogc/?SERVICE=WMTS&REQUEST=GetTile&LAYER=group&FORMAT=image/png&TILEMATRIXSET=EPSG:4326&TILEMATRIX=6&TILEROW=16&TILECOL=64
- calculate TileRanges based on the TileMatrixSetLink provided by GetCapabilities
  - use the TileMatrixSetLink for the chosen TileMatrixSet

TileMatrixSetLink example:
  <TileMatrixSetLink>
    <TileMatrixSet>EPSG:4326</TileMatrixSet>
    <TileMatrixSetLimits>
      <TileMatrixLimits>
      <TileMatrix>0</TileMatrix>
      <MinTileCol>0</MinTileCol>
      <MaxTileCol>1</MaxTileCol>
      <MinTileRow>0</MinTileRow>
      <MaxTileRow>0</MaxTileRow>
      </TileMatrixLimits>
      <TileMatrixLimits>
      <TileMatrix>1</TileMatrix>
      <MinTileCol>0</MinTileCol>
      <MaxTileCol>3</MaxTileCol>
      <MinTileRow>0</MinTileRow>
      <MaxTileRow>1</MaxTileRow>
      </TileMatrixLimits>
      <TileMatrixLimits>
      <TileMatrix>2</TileMatrix>
      <MinTileCol>0</MinTileCol>
      <MaxTileCol>7</MaxTileCol>
      <MinTileRow>0</MinTileRow>
      <MaxTileRow>2</MaxTileRow>
      </TileMatrixLimits>
      ...
      <TileMatrixLimits>
      <TileMatrix>18</TileMatrix>
      <MinTileCol>6960</MinTileCol>
      <MaxTileCol>523147</MaxTileCol>
      <MinTileRow>37646</MinTileRow>
      <MaxTileRow>191219</MaxTileRow>
      </TileMatrixLimits>
    </TileMatrixSetLimits>
  </TileMatrixSetLink>