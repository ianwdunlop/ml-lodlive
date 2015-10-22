describe('sparqlClient', function () {
  before(function () {
    this.sandbox = sinon.sandbox.create()
    this.fixtures = {
      basicResults: fixture.load('test/fixtures/basic-results.json')
    };
  })

  afterEach(function () {
    this.sandbox.restore()
  })

  it('should exist', function () {
    expect(window.sparqlClientFactory).not.to.be.undefined
  })

  it('should create a client', function () {
    var sparqlClient = sparqlClientFactory.create({}, {}, {})
    expect(sparqlClient).not.to.be.undefined
  })

  it('should parse queries and make request', function () {
    var profile = { document: 'QUERY' }
    var httpStub = this.sandbox.stub()
    var sparqlClient = sparqlClientFactory.create(profile, {}, httpStub)

    sparqlClient.document('', {})
    expect(httpStub.calledOnce).to.be.true
    expect(httpStub.args[0][0].query).to.equal('QUERY')
  })

  it('should yield an error with invalid results', function () {
    var profile = { document: 'QUERY' }
    var httpStub = this.sandbox.stub()
    var errorStub = this.sandbox.stub()
    var sparqlClient = sparqlClientFactory.create(profile, {}, httpStub)

    sparqlClient.document('', { error: errorStub })

    expect(httpStub.calledOnce).to.be.true
    expect(httpStub.args[0][0].query).to.equal('QUERY')

    var success = httpStub.args[0][1].success
    success({ results: { data: {} } })

    expect(errorStub.calledOnce).to.be.true
    expect(errorStub.args[0][0]).to.match(/malformed results/)
  })

  it('should parse results', function () {
    var profile = { document: 'QUERY' }
    var httpStub = this.sandbox.stub()
    var successStub = this.sandbox.stub()
    var sparqlClient = sparqlClientFactory.create(profile, {}, httpStub)

    sparqlClient.document('', { success: successStub })

    expect(httpStub.calledOnce).to.be.true
    expect(httpStub.args[0][0].query).to.equal('QUERY')

    var success = httpStub.args[0][1].success
    success(this.fixtures.basicResults)

    expect(successStub.calledOnce).to.be.true
    var args = successStub.args[0][0];

    expect(args.uris.length).to.equal(1)
    expect(args.values.length).to.equal(1)
    expect(args.bnodes.length).to.equal(1)
  })

  it('should fallback to default queries and make request', function () {
    var defaultProfile = { bnode: 'QUERY' }
    var httpStub = this.sandbox.stub()
    var sparqlClient = sparqlClientFactory.create({}, defaultProfile, httpStub)

    sparqlClient.bnode('', {})
    expect(httpStub.calledOnce).to.be.true
    expect(httpStub.args[0][0].query).to.equal('QUERY')
  })

  it('should substitute IRIs', function () {
    var profile = { inverse: 'QUERY {URI}' }
    var httpStub = this.sandbox.stub()
    var sparqlClient = sparqlClientFactory.create(profile, {}, httpStub)

    sparqlClient.inverse('test', {})
    expect(httpStub.calledOnce).to.be.true
    expect(httpStub.args[0][0].query).to.equal('QUERY test')
  })
})
