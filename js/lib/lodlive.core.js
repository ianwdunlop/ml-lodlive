 /*
 *
 * lodLive 1.0
 * is developed by Diego Valerio Camarda, Silvia Mazzini and Alessandro Antonuccio
 *
 * Licensed under the MIT license
 *
 * plase tell us if you use it!
 *
 * geodimail@gmail.com
 *
 *  Heavily refactored by matt@mattpileggi.com to eliminate third-party dependencies and support multiple LodLive instances
 *
 */

(function($) {
  'use strict';

  var jwin = $(window), jbody = $(document.body);

  var utils = require('../../src/utils.js');

  var DEFAULT_BOX_TEMPLATE = '<div class="boxWrapper lodlive-node defaultBoxTemplate"><div class="ll-node-anchor"></div><div class="lodlive-node-label box sprite"></div></div>';

  /** LodLiveProfile constructor - Not sure this is even necessary, a basic object should suffice - I don't think it adds any features or logic
    * @Class LodLiveProfile
    */
  function LodLiveProfile() {

  }

  // instance methods

  /**
    * Initializes a new LodLive instance based on the given context (dom element) and possible options
    *
    * @param {Element|string} container jQuery element or string, if a string jQuery will use it as a selector to find the element
    * @param {object=} options optional hash of options
    */
  function LodLive(container,options) {
    var profile = this.options = options;
    this.uriToLabels = {};
    this.debugOn = options.debugOn && window.console; // don't debug if there is no console
    this.colours = ['salmon', 'crimson', 'red', 'deeppink', 'gold', 'moccasin', 'darkkhaki', 'slateblue', 'lime', 'green', 'aqua', 'midnightblue', 'rosybrown', 'gray', 'tan'];
    this.colourForProperty = {};
    // allow them to override the docInfo function
    if (profile.UI.docInfo) {
      this.docInfo = profile.UI.docInfo;
    }

    // for backwards compatibility with existing profiles
    var connection;

    if (profile.connection.endpoint) {
      connection = profile.connection;
    } else {
      connection = {
        endpoint: profile.connection['http:'].endpoint,
        defaultParams: profile.endpoints.all,
        headers: { Accept: profile.connection['http:'].accepts },
        jsonp: profile.endpoints.jsonp
      };
    }

    // TODO: pass partially applied sparqlClientFactory as constructor paramter
    // (with an httpClientFactory already bound)
    var httpClientFactory = require('../../src/http-client.js');
    var sparqlClientFactory = require('../../src/sparql-client.js');

    this.sparqlClient = sparqlClientFactory.create(httpClientFactory, {
      connection: connection,
      queries: profile.queries || profile.connection['http:'].sparql
    });

    // TODO: pass factory as constructor parameter
    var rendererFactory = require('../../src/renderer.js');

    // for backwards compatibility with existing profiles
    var rendererProfile;

    if (profile.UI.arrows) {
      rendererProfile = profile.UI;
    } else {
      rendererProfile = {
        arrows: profile.arrows,
        tools: profile.UI.tools,
        nodeIcons: profile.UI.nodeIcons,
        relationships: profile.UI.relationships,
        hashFunc: profile.hashFunc
      };
    }

    this.renderer = rendererFactory.create(rendererProfile);
    // temporary, need access from both components
    this.refs = this.renderer.refs;
    this.renderer.boxTemplate = this.boxTemplate = profile.boxTemplate || DEFAULT_BOX_TEMPLATE;

    // allow override from profile
    if (profile.UI.nodeHover) {
      this.renderer.msg = profile.UI.nodeHover;
    }

    // TODO: should this be deferred till LodLive.init()?
    // (constructor shouldn't mutate the DOM)
    this.renderer.init(this, container);

    // temporary, need access from both components
    this.container = this.renderer.container;
    this.context = this.renderer.context;
  }

  LodLive.prototype.init = function(firstUri) {
    // instance data
    this.imagesMap = {};
    this.mapsMap = {};
    this.infoPanelMap = {};
    this.connection = {};

    // TODO: this option isn't respected anywhere
    this.ignoreBnodes = this.options.UI.ignoreBnodes;

    // TODO: look these up on the context object as data-lodlive-xxxx attributes
    // store settings on the instance
    // TODO: set these by default on the instance via the options -
    // consider putting them under 'flags' or some other property

    // TODO: where appropriate, replace magic number 25
    // this.relationsLimit = 25;

    // TODO: this method is missing; implement it, or remove flag
    // this.doStats = false

    // TODO: retrieve these from the profile
    this.doInverse = true;
    this.doAutoExpand = true;
    this.doAutoSameas = true;

    // explicitly disabled, for now
    this.doCollectImages = false;
    this.doDrawMap = false;

    this.classMap = {
      // TODO: let CSS drive color
      counter : Math.floor(Math.random() * 13) + 1
    };

    var firstBox = this.renderer.firstBox(firstUri);
    this.initialNode = firstBox;
    this.openDoc(firstUri, firstBox);

    // TODO: do this in renderer.init()?
    this.renderer.msg('', 'init');
    this.createLozengeCheckbox();
    this.colourToUris = {};
    this.createColourSelector();
    this.createColourChart();
  };

  LodLive.prototype.autoExpand = function() {
    var inst = this;

    inst.context.find('.relatedBox:not([class*=exploded])')
    .each(function() {
      var box = $(this);
      var aId = box.attr('relmd5');

      // if a subject box exists
      if (inst.context.children('#' + aId).length) {
        box.click();
      }
    });
  };

  LodLive.prototype.addNewDoc = function(originalCircle, ele) {
    var inst = this;
    var exist = true;
    var fromInverse = null;

    var rel = ele.attr('rel');
    var aId = ele.attr('relmd5');
    var circleId = ele.data('circleid');
    var propertyName = ele.data('property');
    var isInverse = ele.is('.inverse');

    // TODO: rename for clarity ?
    // var subjectId = circleId; var objectId = aId;

    if (!isInverse) {
      // TODO: add explaination for early return
      if (inst.refs.getObjectRefs(circleId).indexOf(aId.toString()) > -1) {
        return;
      }

      inst.refs.addObjectRef(circleId, aId);
      inst.refs.addSubjectRef(aId, circleId.toString());
    } else {
      if (inst.refs.getObjectRefs(aId).indexOf(circleId.toString()) > -1) {
        return;
      }
      inst.refs.addSubjectRef(circleId.toString(), Number.parseInt(aId));
      inst.refs.addObjectRef(Number.parseInt(aId), circleId.toString());
    }

    var newObj = inst.context.find('#' + aId);

    // verifico se esistono box rappresentativi dello stesso documento
    // nella pagina
    if (!newObj.length) {
      exist = false;
      newObj = $(inst.boxTemplate)
      .attr('id', aId)
      .attr('rel', rel);
    }

    // nascondo l'oggetto del click e carico la risorsa successiva
    ele.hide();

    if (!exist) {
      var pos = parseInt(ele.attr('data-circlePos'), 10);
      var parts = parseInt(ele.attr('data-circleParts'), 10);

      var radiusFactor = parts > 10 ?
                         2 + (pos % 2) :
                         5 / 2;

      var chordsListExpand = utils.circleChords(
        originalCircle.width() * radiusFactor,
        parts,
        originalCircle.position().left + originalCircle.width() / 2,
        originalCircle.position().top + originalCircle.height() / 2,
        null,
        pos
      );

      Array.from(newObj.children()).forEach(function(child) {
        if(child.classList.contains("sprite")) {
            // TODO default #369 - maybe should be be class?
            child.style.backgroundColor = "#369";
            //child.style.backgroundColor = inst.colourForProperty[propertyName];
        }
      });
      inst.context.append(newObj);
      // FIXME: eliminate inline CSS where possible
      newObj.css({
        left : (chordsListExpand[0][0] - newObj.height() / 2),
        top : (chordsListExpand[0][1] - newObj.width() / 2),
        opacity : 1,
        zIndex : 99
      });

      if (isInverse) {
        fromInverse = inst.context.find('div[data-property="' + propertyName + '"][rel="' + rel + '"]');
      }

      inst.openDoc(rel, newObj, fromInverse);
    }

      var allAjaxCalls = [];
      propertyName.split('|').forEach(function(property) {
        var labelKey = property.trim();
        allAjaxCalls.push(inst.generateLabelAjaxCall(labelKey));
      });

    if (!isInverse) {
      Promise.all(allAjaxCalls).then(values => {
        inst.renderer.drawLine(originalCircle, newObj, null, propertyName, inst.uriToLabels);
      });
    } else {
      Promise.all(allAjaxCalls).then(values => {
        inst.renderer.drawLine(newObj, originalCircle, null, propertyName, inst.uriToLabels);
      });
    }
  };

  LodLive.prototype.removeDoc = function(obj, callback) {
    var inst = this;

    var isRoot = inst.context.find('.lodlive-node').length == 1;
    if (isRoot) {
        alert('Cannot Remove Only Box');
        return;
    }

    // TODO: why remove and not hide?
    inst.context.find('.lodlive-toolbox').remove();

    var id = obj.attr('id');

    inst.renderer.clearLines();

    // get subjects where id is the object
    var subjectIds = inst.refs.getSubjectRefs(id);

    // get objects where id is the subject
    var objectIds = inst.refs.getObjectRefs(id)

    // remove references to id
    subjectIds.forEach(function(subjectId) {
      inst.refs.removeObjectRef(subjectId, id);
    });
    objectIds.forEach(function(objectId) {
      inst.refs.removeSubjectRef(objectId, id);
    });

    // get all pairs, excluding self
    //var pairs = inst.renderer.getRelatedNodePairs(id, true);
    //inst.renderer.drawLines(pairs);

    // remove references from id
    inst.refs.removeAsSubject(id);
    inst.refs.removeAsObject(id);
    var nodes = [];
    if (Object.keys(inst.renderer.refs.storeIds).length === 0) {
      return;
    }
    Object.keys(inst.renderer.refs.storeIds).forEach(function(key) {
      var refs = inst.renderer.refs.storeIds[key];
      refs.forEach(function(ref) {
        var contains = false;
        var newNode = {"from": key.slice(3), "to": ref};
        nodes.forEach(function(node) {
            if(!contains && JSON.stringify(node) === JSON.stringify(newNode)) {
              contains = true;
            }
        });
        if (!contains) {
          nodes.push({"from": key.slice(3), "to": ref});
        }
      });
    });

    inst.renderer.drawLines(nodes); 

    // Image rendering has been disabled; keeping for posterity ...
    // var cp = inst.context.find('.lodLiveControlPanel');
    // if (inst.doCollectImages) {
    //   var imagesMap = inst.imagesMap;
    //   if (imagesMap[id]) {
    //     delete imagesMap[id];
    //     inst.updateImagePanel(cp);
    //     cp.find('a[class*=img-' + id + ']').remove();
    //   }
    // }

    // Map rendering has been disabled; keeping for posterity ...
    // if (inst.doDrawMap) {
    //   var mapsMap = inst.mapsMap;
    //   if (mapsMap[id]) {
    //     delete mapsMap[id];
    //     inst.updateMapPanel(cp);
    //   }
    // }

    inst.docInfo();

    obj.fadeOut('normal', null, function() {
      obj.remove();

      // re-show predicate boxes that pointed to this object
      inst.context.find('div[relmd5=' + id + ']').each(function() {
        var found = $(this);
        found.show();
        found.removeClass('exploded');
      });
    });
  };

  /**
    * Default function for showing info on a selected node.  Simply opens a panel that displays it's properties.  Calling it without an object will close it.
    * @param {Object=} obj a jquery wrapped DOM element that is a node, or null.  If null is passed then it will close any open doc info panel
   **/
  LodLive.prototype.docInfo = function(obj) {
    var inst = this;
    var docInfo = inst.container.find('.lodlive-docinfo');
    var URI;

    if (obj == null || ((URI = obj.attr('rel')) && docInfo.is('[rel="'+ URI + '"]'))) {
      console.log('hiding docInfo');
      docInfo.fadeOut('fast').removeAttr('rel');
      return;
    }

    if (!docInfo.length) {
      docInfo = $('<div class="lodlive-docinfo" rel="' + URI + '"></div>');
      inst.container.append(docInfo);
    }

    // duplicated code ...
    // var URI = obj.attr('rel');
    docInfo.attr('rel', URI);

    inst.sparqlClient.document(URI, {
      success : function(info) {
        docInfo.empty().fadeIn();
        inst.formatDoc(docInfo, info.values, info.uris, info.bnodes, URI);
      },
      error : function(e, b, v) {
        var values = [{
          'http://system/msg' : 'Could not find document: ' + URI
        }];
        inst.formatDoc(docInfo, values, [], [], URI);
      }
    });
  };

  LodLive.prototype.formatDoc = function(destBox, values, uris, bnodes, URI) {
    var inst = this;

    //TODO:  Some of these seem like they should be Utils functions instead of on the instance, not sure yet
    // recupero il doctype per caricare le configurazioni specifiche
    var docType = inst.getJsonValue(uris, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'default');
    // carico le configurazioni relative allo stile
    destBox.addClass(inst.getProperty('document', 'className', docType));

    if (!values.length && !bnodes.length) {
      return destBox.append(inst.renderer.docInfoMissing());
    }

    // ed ai path degli oggetti di tipo immagine
    var images = inst.getProperty('images', 'properties', docType);
    // ed ai path dei link esterni
    var weblinks = inst.getProperty('weblinks', 'properties', docType);
    // ed eventuali configurazioni delle proprietÃ  da mostrare
    // TODO: fare in modo che sia sempre possibile mettere il dominio come fallback
    var propertiesMapper = inst.getProperty('document', 'propertiesMapper', URI.replace(/(http:\/\/[^\/]+\/).+/, '$1'));

    // se la proprieta' e' stata scritta come stringa la trasformo in un
    // array
    if (!Array.isArray(images)) {
      images = [images];
    }
    if (!Array.isArray(weblinks)) {
      weblinks = [weblinks];
    }

    var connectedImages = [];
    var connectedWeblinks = [];

    // TODO: get type IRIs from profile
    var types = [];

    uris.forEach(function(uriObj) {
      // TODO: confirm one key?
      var key = Object.keys(uriObj)[0];
      var value = uriObj[key];
      var newVal = {};

      // TODO: iterate type IRIs
      if (key !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type') {
        newVal[key] = value;
        if (images.indexOf(key) > -1) {
          connectedImages.push(newVal);
        } else if (weblinks.indexOf(key) > -1) {
          connectedWeblinks.push(newVal);
        }
      } else {
        types.push(value);
      }
    });


    // TODO: iterate values, looking up replacements in profile property mapper?

    destBox.append(inst.renderer.docInfoTypes(types));
    destBox.append(inst.renderer.docInfoImages(connectedImages));
    destBox.append(inst.renderer.docInfoLinks(connectedWeblinks));
    destBox.append(inst.renderer.docInfoValues(values));


    var renderedBnodes = inst.renderer.docInfoBnodes(bnodes);

    renderedBnodes.forEach(function(obj) {
      destBox.append(obj.bnodeNode);
      inst.resolveBnodes(obj.value, URI, obj.spanNode, destBox);
    });
  };

  LodLive.prototype.resolveBnodes = function(val, URI, spanNode, destBox) {
    var inst = this;

    // TODO: figure out how to fall back to URI
    inst.sparqlClient.bnode(val, {
      beforeSend : function() {
        // destBox.find('span[class=bnode]').html('<img src="img/ajax-loader-black.gif"/>');
        return inst.renderer.loading(spanNode);
      },
      success : function(info ) {
        // s/b unnecessary
        // destBox.find('span[class=bnode]').html('');

        if (info.values.length) {
          inst.renderer.docInfoBnodeValues(info.values, spanNode);
        }

        info.bnodes.forEach(function(bnodeObj) {
          var key = Object.keys(bnodeObj)[0]
          var value = bnodeObj[value];

          var nestedBnodeNode = inst.renderer.docInfoNestedBnodes(key, spanNode);

          inst.resolveBnodes(value, URI, nestedBnodeNode, destBox);
        });

        // // TODO: slimScroll is no long included, and seems to be unnecessary
        // if (destBox.height() + 40 > $(window).height()) {
        //   destBox.slimScroll({
        //     height : $(window).height() - 40,
        //     color : '#fff'
        //   });
        // }
      },
      error : function(e, b, v) {
        // s/b unnecessary
        // destBox.find('span[class=bnode]').html('');
      }
    });
  };

  LodLive.prototype.getJsonValue = function(map, key, defaultValue) {
    var inst = this;
    var start;
    if (inst.debugOn) {
      start = new Date().getTime();
    }
    var returnVal = [];
    $.each(map, function(skey, value) {
      for (var akey in value) {
        if (akey == key) {
          returnVal.push(value[akey]);
        }
      }
    });
    if (returnVal == []) {
      returnVal = [defaultValue];
    }
    if (inst.debugOn) {
      console.debug((new Date().getTime() - start) + '  getJsonValue');
    }
    return returnVal;
  };

  /**
    * Get a property within an area of a context
    *
    * @param {string} area the name of the area
    * @param {string} prop the name of the property
    * @param {array | string} context a context name or an array of context names
    * @returns {string=} the property, if found
    */
  LodLive.prototype.getProperty = function(area, prop, context) {
    var inst = this, lodLiveProfile = inst.options;

    var start;
    if (inst.debugOn) {
      start = new Date().getTime();
    }


    if (Array.isArray(context)) {

      for (var a = 0; a < context.length; a++) {

        if (lodLiveProfile[context[a]] && lodLiveProfile[context[a]][area]) {
          if (prop) {
            return lodLiveProfile[context[a]][area][prop] ? lodLiveProfile[context[a]][area][prop] : lodLiveProfile['default'][area][prop];
          } else {
            return lodLiveProfile[context[a]][area] ? lodLiveProfile[context[a]][area] : lodLiveProfile['default'][area];
          }

        }
      }

    } else {
      // it's expected to be a string if not an array
      context = context + '';
      if (lodLiveProfile[context] && lodLiveProfile[context][area]) {
        if (prop) {
          return lodLiveProfile[context][area][prop] ? lodLiveProfile[context][area][prop] : lodLiveProfile['default'][area][prop];
        } else {
          return lodLiveProfile[context][area] ? lodLiveProfile[context][area] : lodLiveProfile['default'][area];
        }

      }

    }

    if (inst.debugOn) {
      console.debug((new Date().getTime() - start) + '  getProperty');
    }

    if (lodLiveProfile['default'][area]) {
      if (prop) {
        return lodLiveProfile['default'][area][prop];
      } else {
        return lodLiveProfile['default'][area];
      }
    } else {
      return '';
    }
  };


  LodLive.prototype.format = function(destBox, values, uris, inverses) {
    var inst = this, classMap = inst.classMap, lodLiveProfile = inst.options;

    var start;
    if (inst.debugOn) {
      start = new Date().getTime();
    }
    var containerBox = destBox.parent('div');
    var anchorBox = containerBox.find('.ll-node-anchor');
    var thisUri = containerBox.attr('rel') || '';

    // recupero il doctype per caricare le configurazioni specifiche
    var docType = inst.getJsonValue(uris, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', 'default');
    if (thisUri.indexOf('~~') != -1) {
      docType = 'bnode';
    }
    // carico le configurazioni relative allo stile
    var aClass = inst.getProperty('document', 'className', docType);
    if (docType == 'bnode') {
      aClass = 'bnode';
    }

    // destBox.addClass(aClass);
    if (aClass == null || aClass == 'standard' || aClass == '') {
      if (classMap[docType]) {
        aClass = classMap[docType];
      } else {

        aClass = 'box' + classMap.counter;
        //FIXME: this is strange, why manually keeping a counter?
        //FIXME:  13 is a magic number, why?
        if (classMap.counter === 13) {
          classMap.counter = 1;
        } else {
          classMap.counter += 1;
        }
        classMap[docType] = aClass;
      }
    }
    containerBox.addClass(aClass);
    // ed ai path da mostrare nel titolo del box
    var titles = inst.getProperty('document', 'titleProperties', docType);
    // ed ai path degli oggetti di tipo immagine
    var images = inst.getProperty('images', 'properties', docType);
    // ed ai path dei link esterni
    var weblinks = inst.getProperty('weblinks', 'properties', docType);
    // e le latitudini
    var lats = inst.getProperty('maps', 'lats', docType);
    // e le longitudini
    var longs = inst.getProperty('maps', 'longs', docType);
    // e punti
    var points = inst.getProperty('maps', 'points', docType);

    // se la proprieta' e' stata scritta come stringa la trasformo in un
    // array
    if ( typeof titles === 'string') {
      titles = [titles];
    }
    if ( typeof images === 'string') {
      images = [images];
    }
    if ( typeof weblinks === 'string') {
      weblinks = [weblinks];
    }
    if ( typeof lats === 'string') {
      lats = [lats];
    }
    if ( typeof longs === 'string') {
      longs = [longs];
    }
    if ( typeof points === 'string') {
      points = [points];
    }

    // gestisco l'inserimento di messaggi di sistema come errori o altro
    titles.push('http://system/msg');

    var titlePieces = [];

    titles.forEach(function(title) {
      var titleValues;

      if (title.indexOf('http') !== 0) {
        titlePieces.push($.trim(title));
      } else {
        titleValues = inst.getJsonValue(values, title, title.indexOf('http') === 0 ? '' : title);
        titleValues.forEach(function(titleValue) {
          titlePieces.push(titleValue);
        });
      }
    });

    //  Annoying edge case. Found examples where comment used when it should have been label.
    if(titlePieces.length === 0) {
      var titleValues = inst.getJsonValue(values, "http://www.w3.org/2000/01/rdf-schema#comment", "http://www.w3.org/2000/01/rdf-schema#comment");
      titleValues.forEach(function(titleValue) {
        titlePieces.push(titleValue);
      });    
    }

    var title = titlePieces
    // deduplicate
    .filter(function(value, index, self) {
      return self.indexOf(value) === index;
    })
    .join('\n');

    // TODO: early return?
    if (uris.length == 0 && values.length == 0) {
      title = utils.lang('resourceMissing');
    } else if (!title && docType === 'bnode') {
      title = '[blank node]';
    } else if (!title) {
      title = '(Error)';
      try {
        title = inst.options.default.document.titleName[thisUri];
      } catch(ex) {
        title = inst.options.default.document.titleProperties[thisUri];
      }
    }

    inst.renderer.addBoxTitle(title, thisUri, destBox, containerBox);

    // calcolo le uri e le url dei documenti correlati
    var connectedDocs = [];
    var invertedDocs = [];
    var propertyGroup = {};
    var propertyGroupInverted = {};

    // Image rendering has been disabled; keeping for posterity ...
    // var connectedImages = [];

    // Map rendering has been disabled; keeping for posterity ...
    // var connectedLongs = [];
    // var connectedLats = [];

    function groupByObject(inputArray, type) {
      var tmpIRIs = {};
      var outputArray = [];

      inputArray.forEach(function(uriObj) {
        // TODO: ensure only one key?
        var property = Object.keys(uriObj)[0];
        var object = uriObj[property];
        var newObj = {};
        var newKey, previousKey, previousIndex;

        // Image rendering has been disabled; keeping for posterity ...
        // if (type === 'uris' && images.indexOf(property) > -1) {
        //   newObj[property] = escape(resourceTitle);
        //   connectedImages.push(newObj);
        //   return;
        // }

        // skip `weblinks` properties
        if (type === 'uris' && weblinks.indexOf(property) > -1) return;

        // TODO: checking for bnode of bnode?
        if (type === 'inverses' && docType == 'bnode' && object.indexOf('~~') > -1) return;

        // group by object
        if (tmpIRIs.hasOwnProperty(object)) {
          previousIndex = tmpIRIs[object];
          previousKey = Object.keys(outputArray[ previousIndex ])[0]
          newKey = previousKey + ' | ' + property;
          newObj[ newKey ] = object;
          outputArray[ previousIndex ] = newObj;
        } else {
          outputArray.push(uriObj);
          tmpIRIs[object] = outputArray.length - 1;
        }
      });

      return outputArray;
    }

    connectedDocs = groupByObject(uris, 'uris');
    if (inverses) {
      invertedDocs = groupByObject(inverses, 'inverses');
    }

    function groupByPropertyKey(inputArray) {
      var group = {};

      // group URIs by property key
      inputArray.forEach(function(uriObj) {
        // TODO: ensure only one key?
        var property = Object.keys(uriObj)[0];
        var object = uriObj[property];

        if (group.hasOwnProperty(property)) {
          group[property].push(object);
        } else {
          group[property] = [object];
        }
      });

      return group;
    }

    // group URIs by property key
    propertyGroup = groupByPropertyKey(connectedDocs);
    // group inverse URIs by property key
    propertyGroupInverted = groupByPropertyKey(invertedDocs);

    // Map rendering has been disabled; keeping for posterity ...
    // if (inst.doDrawMap) {
    //   for (var a = 0; a < points.length; a++) {
    //     var resultArray = inst.getJsonValue(values, points[a], points[a]);
    //     for (var af = 0; af < resultArray.length; af++) {
    //       if (resultArray[af].indexOf(' ') != -1) {
    //         eval('connectedLongs.push(\'' + unescape(resultArray[af].split(' ')[1]) + '\')');
    //         eval('connectedLats.push(\'' + unescape(resultArray[af].split(' ')[0]) + '\')');
    //       } else if (resultArray[af].indexOf('-') != -1) {
    //         eval('connectedLongs.push(\'' + unescape(resultArray[af].split('-')[1]) + '\')');
    //         eval('connectedLats.push(\'' + unescape(resultArray[af].split('-')[0]) + '\')');
    //       }
    //     }
    //   }
    //   for (var a = 0; a < longs.length; a++) {
    //     var resultArray = inst.getJsonValue(values, longs[a], longs[a]);
    //     for (var af = 0; af < resultArray.length; af++) {
    //       eval('connectedLongs.push(\'' + unescape(resultArray[af]) + '\')');
    //     }
    //   }
    //   for (var a = 0; a < lats.length; a++) {
    //     var resultArray = inst.getJsonValue(values, lats[a], lats[a]);
    //     for (var af = 0; af < resultArray.length; af++) {
    //       eval('connectedLats.push(\'' + unescape(resultArray[af]) + '\')');
    //     }
    //   }

    //   if (connectedLongs.length > 0 && connectedLats.length > 0) {
    //     var mapsMap = inst.mapsMap;
    //     mapsMap[containerBox.attr('id')] = {
    //       longs : connectedLongs[0],
    //       lats : connectedLats[0],
    //       title : thisUri + '\n' + escape(resourceTitle)
    //     };
    //     inst.updateMapPanel(inst.context.find('.lodlive-controlPanel'));
    //   }
    // }

    // Image rendering has been disabled; keeping for posterity ...
    // if (inst.doCollectImages) {
    //   if (connectedImages.length > 0) {
    //     var imagesMap = inst.imagesMap;
    //     imagesMap[containerBox.attr('id')] = connectedImages;
    //     inst.updateImagePanel(inst.context.find('.lodlive-controlPanel'));
    //   }
    // }

    // No longer used; keeping for posterity ...
    // totRelated = Object.keys(propertyGroup).length +
    //              Object.keys(propertyGroupInverted).length;

    // calcolo le parti in cui dividere il cerchio per posizionare i link
    // var chordsList = this.lodlive('circleChords',
    // destBox.width() / 2 + 12, ((totRelated > 1 ? totRelated - 1 :
    // totRelated) * 2) + 4, destBox.position().left + destBox.width() /
    // 2, destBox.position().top + destBox.height() / 2, totRelated +
    // 4);

    var chordsList = utils.circleChords(75, 24, destBox.position().left + 65, destBox.position().top + 65);
    var chordsListGrouped = utils.circleChords(95, 36, destBox.position().left + 65, destBox.position().top + 65);

    // Assign colours to uris.
    var newUris = [];
    Object.keys(propertyGroup).forEach(function(uri) {
      if (!Object.keys(inst.colourForProperty).includes(uri)) {
         newUris.push(uri);
      }
    });

    Object.keys(propertyGroupInverted).forEach(function(uri) {
      if (!Object.keys(inst.colourForProperty).includes(uri)) {
         newUris.push(uri);
      }
    });
    newUris = [...new Set(newUris)];
    inst.renderer.colourForProperty = inst.colourForProperty;
    inst.addColourToChart(newUris);
 
    // iterate over connectedDocs and invertedDocs, creating DOM nodes and calculating CSS positioning
    var connectedNodes = inst.renderer.createPropertyBoxes(connectedDocs, propertyGroup, containerBox, chordsList, chordsListGrouped, false);
    // Need to start inverted nodes at end of connectedNodes
    var invertedNodes = inst.renderer.createPropertyBoxes(invertedDocs, propertyGroupInverted, containerBox, chordsList, chordsListGrouped, true, connectedNodes.objectList.length % 14 + 1);

    // aggiungo al box i link ai documenti correlati
    var objectList = connectedNodes.objectList.concat(invertedNodes.objectList);
    var innerObjectList = connectedNodes.innerObjectList.concat(invertedNodes.innerObjectList);

    // paginate and display the related boxes
    inst.renderer.paginateRelatedBoxes(containerBox, objectList, innerObjectList, chordsList);

    // append the tools
    inst.renderer.generateNodeIcons(anchorBox);
  };

  LodLive.prototype.openDoc = function(anUri, destBox, fromInverse) {
    var inst = this;
    var lodLiveProfile = inst.options;

    if (!anUri) {
      $.error('LodLive: no uri for openDoc');
    }

    // TODO: what is methods && what is doStats? neither exist ...
    // if (inst.doStats) {
    //   methods.doStats(anUri);
    // }

    destBox.attr('data-endpoint', lodLiveProfile.connection['http:'].endpoint);

    var inverses = [];

    function callback(info) {
      // Assign colours to uris.
//      var newUris = [];
//      info.uris.forEach(function(uri) {
//        if (!Object.keys(inst.colourForProperty).includes(Object.keys(uri)[0])) {
//           inst.colourForProperty[Object.keys(uri)[0]] = inst.colours[utils.getRandomInt(0,16)];
//           newUris.push(Object.keys(uri)[0]);
//        }
//      });
//      inverses.forEach(function(uri) {
//        if (!Object.keys(inst.colourForProperty).includes(Object.keys(uri)[0])) {
//           inst.colourForProperty[Object.keys(uri)[0]] = inst.colours[utils.getRandomInt(0,16)];
//           newUris.push(Object.keys(uri)[0]);
//        }
//      });
//      inst.addColourToChart(newUris);
      inst.format(destBox.children('.box'), info.values, info.uris, inverses);

      if (fromInverse && fromInverse.length) {
        $(fromInverse).click();
      }

      if (inst.doAutoExpand) {
        inst.autoExpand(destBox);
      }
    };

    inst.sparqlClient.documentUri(anUri, {
      beforeSend : function() {
        // destBox.children('.box').html('<img style=\"margin-top:' + (destBox.children('.box').height() / 2 - 8) + 'px\" src="img/ajax-loader.gif"/>');
        return inst.renderer.loading(destBox.children('.box'))
      },
      success : function(info) {
        // reformat values for compatility

        // TODO: refactor `format()` and remove this
        info.bnodes.forEach(function(bnode) {
          var keys = Object.keys(bnode)
          var value = {};
          keys.forEach(function(key) {
            value[key] = anUri + '~~' + bnode[key];
          })
          info.uris.push(value);
        })

        delete info.bnodes;

        // TODO: filter info.uris where object value === anURI (??)

        // s/b unnecessary
        // destBox.children('.box').html('');

        if (!inst.doInverse) {
          return callback(info);
        }

        inst.sparqlClient.inverse(anUri, {
          beforeSend : function() {
            // destBox.children('.box').html('<img id="1234" style=\"margin-top:' + (destBox.children('.box').height() / 2 - 5) + 'px\" src="img/ajax-loader.gif"/>');
            return inst.renderer.loading(destBox.children('.box'));
          },
          success : function(inverseInfo) {
            // TODO: skip values?
            inverses = inverseInfo.uris.concat(inverseInfo.values);

            // parse bnodes and add to URIs
            // TODO: refactor `format()` and remove this
            inverseInfo.bnodes.forEach(function(bnode) {
              var keys = Object.keys(bnode);
              var value = {};
              keys.forEach(function(key) {
                value[key] = anUri + '~~' + bnode[key];
              });
              inverses.push(value);
            });

            if (inst.doAutoSameas) {
              inst.findInverseSameAs(anUri, inverses, function() {
                callback(info);
              });
            } else {
              callback(info);
            }
          },
          error : function(e, b, v) {
            // s/b unnecessary
            // destBox.children('.box').html('');

            callback(info);
          }
        });
      },
      error : function(e, b, v) {
        inst.renderer.errorBox(destBox);
      }
    });
  };

  LodLive.prototype.findInverseSameAs = function(anUri, inverse, callback) {
    var inst = this;

    // TODO: why two options? (useForInverseSameAs and doAutoSameas)
    if (!inst.options.connection['http:'].useForInverseSameAs) {
      return setTimeout(function() { callback(); }, 0);
    }

    var start;
    if (inst.debugOn) {
      start = new Date().getTime();
    }

    inst.sparqlClient.inverseSameAs(anUri, {
      success : function(json) {
        json = json.results.bindings;

        $.each(json, function(key, value) {
          var newObj = {};
          var key = value.property && value.property.value || 'http://www.w3.org/2002/07/owl#sameAs';
          newObj[key] = value.object.value;
          // TODO: why the 2nd array element?
          inverse.splice(1, 0, newObj);
        });

        callback();
      },
      error : function(e, b, v) {
        callback();
      }
    });

    if (inst.debugOn) {
      console.debug((new Date().getTime() - start) + '  findInverseSameAs');
    }
  };

  // Try to get a label for a URI
  LodLive.prototype.generateLabelAjaxCall = function(uri) {
    var me = this;
    // We might already have the label or at least tried to get it
    if (me.uriToLabels[uri] != null ) {
      var promise = new Promise(function(resolve, reject) {
        resolve(uri);
      });
      return promise;
    } else {
      var SPARQLQuery = me.options.connection['http:'].endpoint + '?query=' + encodeURIComponent(me.options.default.sparql.label.replace('{URI}', uri));
      var aCall = $.get({
        contentType: 'application/json',
        dataType: 'json',
        url: SPARQLQuery
      }).done(function(data) {
        var result = data['results']['bindings'];
        if (result != null && result.length > 0 && result[0].label != null) {
          // We have an actual label
          me.uriToLabels[uri] = result[0].label.value;
        } else {
          // No label, it's just the URI
          me.uriToLabels[uri] = uri;
        }
      });
      return aCall;
    }
  }

  LodLive.prototype.createLozengeCheckbox = function() {
    var me = this;
    var div = document.createElement("div"); 
    div.classList.add("flip-div");
    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "lozenge-checkbox";
    checkbox.onclick = function() {
      me.changeToLozengeView();
    };

    var label = document.createElement('label')
    label.htmlFor = "lozenge-checkbox";
    label.appendChild(document.createTextNode('Change view'));
    div.appendChild(checkbox);
    div.appendChild(label);
    var ld = document.getElementById("lozenge-div");
    if (ld != null) {
      ld.appendChild(div);
    }
  }

  LodLive.prototype.changeToLozengeView = function() {
      Array.from(document.getElementsByClassName('sprite')).forEach(function(element) {
          element.style.height = "60px";
          element.style.borderRadius = "20px";
      });
      Array.from(document.getElementsByClassName('relatedBox')).forEach(function(element) {
          element.style.visibility = "hidden";
      });
      Array.from(document.getElementsByClassName('groupedRelatedBox')).forEach(function(element) {
          element.style.visibility = "hidden";
      });
      Array.from(document.getElementsByClassName('pageNext')).forEach(function(element) {
          element.style.visibility = "hidden";
      });
      Array.from(document.getElementsByClassName('actionBox')).forEach(function(element) {
          element.style.top = "-9px";
      });
      var target = this.initialNode[0];
      this.renderer.reDrawLines($(target));
  }

  LodLive.prototype.createColourChart = function() {
    var me = this;
    ///var div = document.createElement("div"); 
    //div.classList.add("colour-chart");
    var table = document.createElement("table");
    table.id = "colour-chart-table";
    table.classList.add("colour-chart-table");
//    checkbox.onclick = function() {
//      me.changeToLozengeView();
//    };
    var thead = document.createElement('thead');
    var trow = document.createElement('tr')
    var propertyColumn =  document.createElement('th');
    propertyColumn.appendChild(document.createTextNode('Property'));
    var colourColumn = document.createElement('th');
    colourColumn.appendChild(document.createTextNode('Colour'));
    trow.appendChild(colourColumn);
    trow.appendChild(propertyColumn);
    thead.appendChild(trow);
    var tbody = document.createElement('tbody');
    //table.appendChild(thead);
    table.appendChild(tbody);
    //div.appendChild(label);
    //div.appendChild(ul);
    var cc = document.getElementById("colour-chart");
    var title = document.createElement("h4");
    title.classList.add("center");
    title.innerHTML = "Property Groups";
    var div = document.createElement("div");
    div.appendChild(title);
    div.appendChild(table);
    if (cc != null) {
      cc.appendChild(div);
    }
    // Renderer can update the list when a new uri type gets added
    me.colourChart = tbody;
  }

  LodLive.prototype.createColourSelector = function() {
    var me = this;
    if (document.getElementById('slider') == null && document.getElementById('picker') == null) {
      return;
    }
    me.colourPicker = ColorPicker(
      document.getElementById('slider'), 
      document.getElementById('picker'), 

      function(hex, hsv, rgb, pickerCoordinate, sliderCoordinate) {
        me.selectedColourClick.style.background = hex;
        var dp = me.selectedColourClick.getAttribute("data-property");
        me.colourForProperty[dp] = hex;
        me.renderer.colourForProperty = me.colourForProperty;
        document.querySelectorAll('[data-property="' + dp + '"][class~="relatedBox"]').forEach(function(node) {
            node.style.color = hex;
        });
        document.querySelectorAll('[data-property="' + dp + '"][class~="groupedRelatedBox"]').forEach(function(node) {
            node.style.color = hex;
        });
        var nodes = [];
        if (Object.keys(me.renderer.refs.storeIds).length > 0) {
          Object.keys(me.renderer.refs.storeIds).forEach(function(key) {
            var refs = me.renderer.refs.storeIds[key];
            refs.forEach(function(ref) {
              var contains = false;
              var newNode = {"from": key.slice(3), "to": ref};
              nodes.forEach(function(node) {
                if(!contains && JSON.stringify(node) === JSON.stringify(newNode)) {
                  contains = true;
                }
              });
              if (!contains) {
                nodes.push({"from": key.slice(3), "to": ref});
              }
            });
          });
          me.renderer.clearLines();
          me.renderer.drawLines(nodes);
        }

//                        document.getElementById('slider-wrapper').classList.add('invisible');
//                        document.getElementById('picker-wrapper').classList.add('invisible');

      }
    );
    document.getElementById("colour-click-button").onclick = function() {
      document.getElementById('colour-picker-complete').classList.add('invisible');
    };
  }

  LodLive.prototype.whichTransitionEvent = function(el) {
    var t;
    var transitions = {
      'transition':'animationend',
      'OTransition':'oAnimationEnd',
      'MozTransition':'animationend',
      'WebkitTransition':'webkitAnimationEnd'
    }

    for(t in transitions){
        if( el.style[t] !== undefined ){
            return transitions[t];
        }
    }
}

  LodLive.prototype.addColourToChart = function(newUris) {
    var cc = this.colourChart;
    var me = this;
    newUris.forEach(function(uri) {
      var currentUri = uri;
      var allAjaxCalls = [];
      uri.split('|').forEach(function(property) {
        var labelKey = property.trim();
        allAjaxCalls.push(me.generateLabelAjaxCall(labelKey));
      });

      Promise.all(allAjaxCalls).then(values => {

      var tr = document.createElement("tr");
      var pulse = document.createElement("span");
      pulse.classList.add("glyphicon", "glyphicon-play-circle", "small-padding-right", "small-padding-left", "show-pulse");
      pulse.setAttribute("title", "Click to highlight nodes with this property");
      pulse.onclick = function() {
        document.querySelectorAll('.relatedBox[data-property="' + uri + '"]').forEach(function(node) {
            // Next 3 lines requried to trigger animation again
            node.style.animation = 'none';
            node.offsetHeight; /* trigger reflow */
            node.style.animation = null;
            // Probably already removed due to transition callback - but just in case
            node.classList.remove("pulser");
            // If node is hidden then don't animate
            if(node.style.display != "none" && node.parentElement.style.display != "none") {
                node.classList.add("pulser");
                // Remove class after end of animation
                node.addEventListener(me.whichTransitionEvent(node), function(event) {
                    event.target.classList.remove('pulser');
                });

            }
        });
        document.querySelectorAll('.groupedRelatedBox[data-property="' + uri + '"]').forEach(function(node) {
            // Next 3 lines requried to trigger animation again
            node.style.animation = 'none';
            node.offsetHeight; /* trigger reflow */
            node.style.animation = null;
            node.classList.remove("pulser");
            if (node.style.opacity != "0.3" && node.parentElement.style.display != "none") {
                node.classList.add("pulser");
                node.addEventListener(me.whichTransitionEvent(node), function(event) {
                   event.target.classList.remove('pulser');
                });
            }
        });
      };
      tr.classList.add("colour-chart-row");
//    checkbox.onclick = function() {
//      me.changeToLozengeView();
//     };
      var linkTd = document.createElement('td');
      var colourTd = document.createElement('td');
      var links = [];
      uri.split("|").forEach(function(splitUri) {
        var link = document.createElement("a");
        link.classList.add("small-padding-left");
        link.href = splitUri.trim();
        link.innerHTML = me.uriToLabels[splitUri.trim()];
        links.push(link);
      });
      var colourClick = document.createElement("span");
      //colourClick.id= "colour-click-" + me.renderer.hashFunc(currentUri);
      colourClick.setAttribute("data-property", currentUri);
      colourClick.setAttribute("title", "Click to change colour");
      //colourClick.style.backgroundColor = "red";
      var colour = uri === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" ? "black" : "#369";
      me.colourForProperty[uri] = colour;
      me.renderer.colourForProperty = me.colourForProperty;
      var colourStyle = "background: " +  colour + "; display: inline-block; height: 1em; width: 1em; border: 1px solid blue;cursor: pointer";
      colourClick.setAttribute("style", colourStyle);
      colourClick.onclick = function() {
        me.selectedColourClick = this;
        document.getElementById('colour-picker-complete').classList.remove('invisible');
      };
      //me.colourToUris[] = currentUri;
      colourTd.appendChild(colourClick);
      var linkTd = document.createElement('td');
      linkTd.appendChild(pulse);
      links.forEach(function(link) {
        linkTd.appendChild(link);
      });
      tr.appendChild(colourTd);
      tr.appendChild(linkTd);
      cc.appendChild(tr);
    });
      });
  }


  //TODO: these line drawing methods don't care about the instance, they should live somewhere else


  // expose our Constructor if not already present
  if (!window.LodLive) {
    window.LodLive = LodLive;
  }

  /* end lines*/;
  /**
    * jQuery plugin for initializing a LodLive instance.  This will initialize a new LodLive instance for each matched element.
    * @param {object | string=} options for legacy support this can be a string which is the method, \n
    *   new callers should send an options object which should contain at least 'profile': an instance of LodLiveProfile with which to configure the instance \n
    *   it may also contain 'method': the name of a LodLive prototype method to invoke (init is default) \n
    *   if invoking a method with arguments, 'args': may be included as an array of arguments to pass along to the method \n
    *   When invoking 'init', the entire options will be sent along to the init(ele, options) call and 'args' will be ignored
    *
    * If selector.lodlive() is called without any arguments, then the existing instance of LodLive will be returned.  \n
    *  **** This is NOT backwards compatible **** \n
    * But it is necessary due to the need to pass in a LodLiveProfile option.  This version of LodLive makes use of NO GLOBAL VARIABLES! \n
    * The bare miniumum to create a new LodLive instance is selector.lodlive({profile: someProfileInstance }); \n
    * More complex instances can be created by passing in more options: \n
    *   selector.lodlive({ profile: someProfileInstance, hashFunc: someHashingFunction, firstURI: 'string URI to load first'});
    */
  jQuery.fn.lodlive = function(options) {
    // if no arguments are provided, then we attempt to return the instance on what is assumed to be a single element match
    if (!arguments.length) {
      return this.data('lodlive-instance');
    }

    if (typeof options === 'string') { // legacy support, method was the only argument
      options = { method: options };
    }
    // we support multiple instances of LodLive on a page, so initialize (or apply) for each matched element
    return this.each(function() {
      var ele = $(this), ll = ele.data('lodlive-instance');
      // no method defaults to init
      if (!options.method || options.method.toLowerCase() === 'init') {

        ll = new LodLive(ele, options.profile);
        ele.data('lodlive-instance', ll);
        ll.init(options.firstUri); // pass in this element and the complete options

      } else if (LodLive.prototype.hasOwnProperty(options.method) && ele.data('lodlive-instance')) {

        ll[options.method].apply(ll, options.method.args || []); // if calling a method with arguments, the options should contain a property named 'args';
      } else {

        jQuery.error('Method ' + options.method + ' does not exist on jQuery.lodlive');

      }

    });
  };

})(jQuery);
