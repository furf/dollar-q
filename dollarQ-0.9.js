(function() {

  /**
   * $Q JavaScript Query Meta-Language
   *
   * @author David Furfero <furf@furf.com>
   * @version 0.9b
   * @namespace
   */


  /**
   * Evaluates for a valid property name
   * @private
   * @constant
   * @type {RegExp}
   */
  var VALID_PROPERTY_REG_EXP = /^([a-zA-Z_$][a-zA-Z0-9_$]*)$/;


  /**
   * Evaluates for a valid object name
   * @private
   * @constant
   * @type {RegExp}
   */
  var VALID_OBJECT_REG_EXP = /^([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)$/;


  /**
   * Evaluates for an object property name with an optional alias (case-insensitive)
   * @private
   * @constant
   * @type {RegExp}
   */
  var VALID_SELECT_REG_EXP = /^([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)(?:\s+(?:as|AS)\s+([a-zA-Z_$][a-zA-Z0-9_$]*))?$/;


  /**
   * Evaluates for an object property name with an optional sort order
   * (case-insensitive)
   * @private
   * @constant
   * @type {RegExp}
   */
  var VALID_ORDER_REG_EXP = /^([a-zA-Z_$][a-zA-Z0-9_$]*(?:\.[a-zA-Z_$][a-zA-Z0-9_$]*)*)(?:\:(String|Number|Boolean|Date))?(?:\s+(asc|ASC|desc|DESC))?$/;


  /**
   * Recurses an object to retrieve the value of a nested property.
   * @example getDeepValue({ pet:{ name:'Henry' } }, 'pet.name');
   *
   * @param {Object} obj Object to recurse
   * @param {String} prop Dot notation path to nested property
   * TODO: can this be made faster?
   */
  var getDeepValue = function(obj, prop) {
    var props = prop.split('.');
    while (typeof obj !== 'undefined' && props.length) {
      obj = obj[props.shift()] || undefined;
    }
    return obj;
  };


  /**
   * FilterBuilder
   *
   * Constructs objects whose sole purpose is to append an evaluation function
   * to a Query filter stack. The FilterBuilder prototype contains methods
   * which dynamically create curried functions (using the property passed to
   * the FilterBuilder constructor and the parameter value passed to the
   * method) which are used by Query objects to evaluate and filter an object.
   *
   * FilterBuilder can be extended dynamically to include additional custom
   * methods using the static extend method. This method is made public
   * through the $Q.addFilter method.
   *
   * @class
   * @abstract
   * @param {String} prop
   * @param {Query} query
   * @constructs
   */
  var FilterBuilder = function(prop, query, isOrFilter) {

    /**
     *
     */
    this.property = prop;

    /**
     *
     */
    this.query = query;

    /**
     *
     */
    this.isOrFilter = isOrFilter;

    /**
     * Negates return value of evaluation function
     * @type {Boolean}
     */
    this.inverse  = false;
  };

  FilterBuilder.prototype = {

    /**
     * Flips the inverse flag
     * @returns {Object} FilterBuilder object
     */
    not: function() {
      this.inverse = !this.inverse;
      return this;
    }
  };

  /**
   * The evaluate function is wrapped in an object to
   * emulate a Query instance to allow us recursive
   * filtering without the instanceof check (15%)
   */
  FilterBuilder.extend = function(name, fn) {

    this.prototype[name] = function(value)  {

      var property = this.property;
      var filter;

      /**
       * If property is undefined, evaluate the object
       */
      if (typeof property === 'undefined') {

        if (this.inverse) {
          filter = function(obj) {
            return !fn(obj, value);
          };
        } else {
          filter = function(obj) {
            return fn(obj, value);
          };
        }

      /**
       * If property is deep, recurse the object
       */
      } else if (property.indexOf('.') > -1) {
        if (this.inverse) {
          filter = function(obj) {
            return !fn(getDeepValue(obj, property), value);
          };
        } else {
          filter = function(obj) {
            return fn(getDeepValue(obj, property), value);
          };
        }

      /**
       * Otherwise, just use the property
       */
      } else {
        if (this.inverse) {
          filter = function(obj) {
            return !fn(obj[property], value);
          };
        } else {
          filter = function(obj) {
            return fn(obj[property], value);
          };
        }
      }

      /**
       * Add filter to the query
       */
      this.query.addFilter(filter, this.isOrFilter);

      return this.query;
    };
  };



  /**
   * @class
   */
  var Query = function() {

    /**
     * A hash of select properties indexed by their optional aliases
     * @type {Object}
     */
    this._selectProperties = [];

    /**
     * An array of objects to be filtered and sorted
     * @type {Array}
     */
    this._fromObjects = [];

    /**
     * An array of subtractive filters
     * @type {Array}
     */
    this._andFilters = [];

    /**
     * An array of additive filters
     * @type {Array}
     */
    this._orFilters = [];

    /**
     * A hash of order properties and their associated directions
     * @type {Object}
     */
    this._orderProperties = [];

    /**
     * @type {Number}
     */
    this._offset = 0;

    /**
     * @type {Number}
     */
    this._limit = null;
  };
  Query.prototype = {



    _castAsString: function(val) {
      return new String(val);
    },

    _castAsNumber: function(val) {
      return new Number(val);
    },

    _castAsBoolean: function(val) {
      return new Boolean(val);
    },

    _castAsDate: function(val) {
      return new Date(val);
    },

    /**
     * Defines object properties for result objects with optional aliases
     * @param {String} select properties
     * @returns Query instance
     * @throws Invalid argument
     * @throws Duplicate property
     */
    /* TODO: add type casting to select */
    select: function() {

      /**
       * Reset any previously assigned select properties
       */
      this._selectProperties = [];

      for (var i = 0, n = arguments.length; i < n; ++i) {
        var prop = arguments[i];

        /**
         * Validate argument for type
         */
        if (typeof prop !== 'string') {
          throw new TypeError('$Q.select: Invalid argument ' + prop);
        }

        /**
         * Parse cast type (TODO) and alias
         */
        var match = VALID_SELECT_REG_EXP.exec(prop);

        /**
         * Validate argument for composition
         */
        if (match === null) {
          throw new TypeError('$Q.select: Invalid argument ' + prop);
        }

        this._selectProperties.push({
          property: match[1],
          alias:    match[2] || match[1]
        });
      }

      return this;
    },


    /**
     * @param {array|object} data sources
     * @returns $Q instance
     */
    from: function() {

      /**
       * Reset any previously assigned from objects
       */
      this._fromObjects = [];

      for (var i = 0, n = arguments.length; i < n; ++i) {
        this._fromObjects = this._fromObjects.concat(arguments[i]);
      };

      return this;
    },


    /**
     *
     * @param {String|Query}
     * @returns {FilterBuilder}
     */
    /* TODO: add type casting to where */
    where: function(prop) {

      if (prop instanceof Query) {
        this._andFilters.push(prop);
        return this;
      }

      return new FilterBuilder(prop, this, false);
    },


    /**
     *
     * @param {String|Query}
     * @returns {FilterBuilder}
     */
    or: function(prop) {

      if (prop instanceof Query) {
        this._orFilters.push(prop);
        return this;
      }

      return new FilterBuilder(prop, this, true);
    },


    /**
     * @param {Object}
     * @param {Boolean} True is filter should be evaluated as an "or" filter
     */
    addFilter: function(filter, isOrFilter) {

      /**
       * Wrap filter in object as _evaluate for compatibility
       * passing Query instances as where clauses
       */
      if (isOrFilter) {
        this._orFilters.push({ _evaluate: filter });
      } else {
        this._andFilters.push({ _evaluate: filter });
      }
    },


    /**
     *
     */
    orderBy: function() {

      // Reset any previously assigned order
      this._orderProperties = [];

      for (var i = 0, n = arguments.length; i < n; ++i) {
        var prop = arguments[i];

        /**
         * Validate argument for type
         */
        if (typeof prop !== 'string') {
          throw new TypeError('$Q.orderBy: Invalid argument ' + prop);
        }

        /**
         * Parse cast type and alias
         */
        var match = VALID_ORDER_REG_EXP.exec(prop);

        /**
         * Validate argument for composition
         */
        if (match === null) {
          throw new TypeError('$Q.orderBy: Invalid argument ' + prop);
        }

        /**
         * If descending order is not explicitly stated, ascending order is applied
         */
        var orderProperty =  {
          property:   match[1],
          descending: (typeof match[3] !== 'undefined' && match[3].toUpperCase() === 'DESC')
        };

        // TODO: check performance of casting and look for optimizations
        // Possibly create differnt casts for different purposes
        // ie. maybe casting as date for order can convert to simple integer
        // where casting as date for select might convert to date
        if (typeof match[2] !== 'undefined' && typeof this['_castAs' + match[2]] === 'function') {
          orderProperty.cast = this['_castAs' + match[2]];
        }

        this._orderProperties.push(orderProperty);

      }
      return this;
    },


    /**
     * @param {Number} (optional) offset Starting offset for query
     * @param {Number} limit Maximum number of results to return
     * @returns {Object}
     */
    limit: function() {
      switch (arguments.length) {
        case 1:
          this._offset = 0;
          this._limit  = arguments[0];
          break;
        case 2:
          this._offset = arguments[0];
          this._limit  = arguments[1];
          break;
        case 0:
          throw new Error('$Q.limit: Unspecified limit');
        default:
          throw new Error('$Q.limit: Too many arguments');
      }
      return this;
    },


    /**
     * TODO: There may be a speed benefit to toggling the order
     * of "and" filters and "or" filters depending on the number
     * of each in the query.
     *
     * Tested: reversing seems to take same time, toggling based
     * on filter lengths is slower by 4%.
     *
     * Correction: The toggling test was incorrectly performed inside
     * the _evaluate method and therefore repeated too often. It's still
     * possible to check length of "and" and "or" filters outside of
     * evaluation and call alternate evaluate method.
     *
     * If alternate methods are used, there will need to be consideration
     * for the filter._evaluate which is used to allow nested clauses.
     *
     * @param {Object}
     * @returns {Boolean} True if object meets all specified criteria
     */
    _evaluate: function(obj) {

      /**
       * Eliminate an object if it fails any "and" criterion...
       */
      for (var i = 0, n = this._andFilters.length; i < n; ++i) {

        if (!this._andFilters[i]._evaluate(obj)) {

          /**
           * ...unless it passes any "or" criterion.
           */
          for (var j = 0, m = this._orFilters.length; j < m; ++j) {

            if (this._orFilters[j]._evaluate(obj)) {
              return true;
            }
          }
          return false;
        }
      }
      return true;
    },


    /**
     * NOTE: WOW! quicksort is really fast!
     */
    _sort: function(data, depth, orderPropertyIndex) {

      /**
       * Move along, nothing to sort here.
       */
      if (data.length <= 1) {
        return data;
      }

      var greater    = [],
          lesser     = [],
          equal      = [],
          order      = this._orderProperties[orderPropertyIndex],
          property   = order.property,
          descending = order.descending,
          cast       = order.cast,
          pivot      = data[0];

      // TODO: look for optimization to avoid the if
      var goDeep = property.indexOf('.') > -1;
      var pivotValue = (goDeep ? getDeepValue(pivot, property) : pivot[property]) || '';

      if (typeof cast === 'function') {
        pivotValue = cast(pivotValue);
      }

      for (var i = 0, len = data.length; i < len; ++i) {

        var obj = data[i];

        // TODO: look for optimization to avoid the if
        var objValue = (goDeep ? getDeepValue(obj, property) : obj[property]) || '';

        if (typeof cast === 'function') {
          objValue = cast(objValue);
        }

        if (objValue < pivotValue) {
          lesser.push(obj);
        } else if (objValue > pivotValue) {
          greater.push(obj);
        } else {
          equal.push(obj);
        }
      }

      if (orderPropertyIndex < this._orderProperties.length - 1) {
        equal = this._sort(equal, depth, orderPropertyIndex + 1);
      }

      /* WOW - nice performance bump from applying push over concat */
      // .144-.159ms
      if (descending) {
        var r = this._sort(greater, depth + 1, orderPropertyIndex);
        Array.prototype.push.apply(r, equal);
        Array.prototype.push.apply(r, this._sort(lesser, depth + 1, orderPropertyIndex));
      } else {
        var r = this._sort(lesser, depth + 1, orderPropertyIndex);
        Array.prototype.push.apply(r, equal);
        Array.prototype.push.apply(r, this._sort(greater, depth + 1, orderPropertyIndex));
      }
      return r;

      // .155-.173ms
      // if (descending) {
      //   return this._sort(greater, depth + 1, orderPropertyIndex).concat(equal.concat(this._sort(lesser, depth + 1, orderPropertyIndex)));
      // } else {
      //   return this._sort(lesser, depth + 1, orderPropertyIndex).concat(equal.concat(this._sort(greater, depth + 1, orderPropertyIndex)));
      // }
    },


    /**
     * @param {Object}
     * @returns {Object}
     */
    _mapPropertiesToAliases: function(obj) {

      var mappedObj = {};

      for (var i = 0, n = this._selectProperties.length; i < n; ++i) {
        var select = this._selectProperties[i];
        mappedObj[select.alias] = getDeepValue(obj, select.property);
      };

      return mappedObj;
    },


    /**
     * @returns Array of qualified objects
     */
    _execute: function() {

      var results = [];

      // if (this._orFilters.length === 0) {
      //   this._evaluate = this._evaluateAndFiltersOnly;
      // } else if (this._andFilters.length > this._orFilters.length) {
      //   this._evaluate = this._evaluateOrFiltersBeforeAndFilters;
      // } else {
      //   this._evaluate = this._evaluateAndFiltersBeforeOrFilters;
      // }

      for (var i = 0, len = this._fromObjects.length; i < len; ++i) {
        if (this._evaluate(this._fromObjects[i])) {
          results.push(this._fromObjects[i]);
        }
      }

      /**
       * orderBy
       *
       * TODO: consider performing sort above evaluation for
       * queries with limits to eliminate need to evaluate
       * once number of results is achieved.
       * Will need to consider where in the results the range
       * of results lies. Ranges at top of result set will
       * benefit more.
       */
      if (this._orderProperties.length > 0) {
        results = this._sort(results, 0, 0);
      }


      /**
       * limit
       *
       * Return results within offset/limit boundaries
       * TODO: take limit and offset as parameters
       */
      if (this._limit !== null) {
        results = results.splice(this._offset, this._limit);
      }

      /**
       * select
       *
       * If query select is empty, return entire matched object.
       * Otherwise, return new object containing only the
       * specified select properties.
       *
       * TODO: _mapPropertiesToAliases causes a large performance hit.
       * It is 250-300% slower than without select properties.
       * Is there another way to process with less impact?
       * UPDATE: This hit is down to 25% somehow.
       *
       * Also, should I consider cloning the results so original
       * data is unaffected?
       */
      /**
       * Moved intensive mapping function to after splice so it is not
       * performed unless absolutely necessary. Also there is a small
       * performance bump by removing the selectIsEmpty check on every object
       */
      if (this._selectProperties.length > 0) {
        for (var i = 0, n = results.length; i < n; ++i) {
          results[i] = this._mapPropertiesToAliases(results[i]);
        };
      }

      return results;
    },


    /**
     *
     */
    get: function() {
      return this._execute();
    },


    /**
     * @returns Number of qualified objects
     */
    count: function() {

      var n = 0;

      for (var i = 0, len = this._fromObjects.length; i < len; ++i) {
        if (this._evaluate(this._fromObjects[i])) {
          n++;
        }
      }

      return n;
    },

    /**
     *
     */
    paginate: function(resultsPerPage) {

      var results = this._execute();
      var page = -1;
      var pagedResults = [];

      for (var i = 0, n = results.length; i < n; ++i) {
        if (i % resultsPerPage === 0) {
          pagedResults[++page] = [];
        }
        pagedResults[page].push(results[i]);
      }

      return {
        totalResults: results.length,
        totalPages:   pagedResults.length,
        pages:        pagedResults
      };
    },


    /**
     * Test functions
     */

    /**
     * @param {Object} obj
     * @param {Boolean} expectedResult
     * @returns {Boolean}
     */
    test: function(obj, expectedResult) {
      return this._evaluate(obj) === expectedResult;
    },

    /**
     * @param {Object} obj
     * @returns {Boolean}
     */
    assert: function(obj) {
      return this.test(obj, true);
    },

    /**
     * @param {Object} obj
     * @returns {Boolean}
     */
    reject: function(obj) {
      return this.test(obj, false);
    }
  };

  /**
   * Alias the and method to the where method
   */
  Query.prototype.and = Query.prototype.where;







  var $Q = function() {
    var q = new Query();
    return q.from.apply(q, arguments);
  };

  $Q.addFilter = function(name, fn) {
    FilterBuilder.extend(name, fn);
  };


  /**
   * Core filters
   */
  $Q.addFilter('eq', function(v, curry) {
    return v == curry;
  });

  $Q.addFilter('ne', function(v, curry) {
    return v != curry;
  });

  $Q.addFilter('gt', function(v, curry) {
    return v > curry;
  });

  $Q.addFilter('gte', function(v, curry) {
    return v >= curry;
  });

  $Q.addFilter('lt', function(v, curry) {
    return v < curry;
  });

  $Q.addFilter('lte', function(v, curry) {
    return v <= curry;
  });

  $Q.addFilter('isEmpty', function(v) {
    return v === '' || v === 0 || v === '0' || v === null || v === false || typeof v === 'undefined' || v.length === 0;
  });

  $Q.addFilter('isString', function(v) {
    return typeof v === 'string';
  });

  $Q.addFilter('isNumber', function(v) {
    return typeof v === 'number' && isFinite(v);
  });

  $Q.addFilter('isNull', function(v) {
    return v === null;
  });

  $Q.addFilter('isDefined', function(v) {
    return typeof v !== 'undefined';
  });

  $Q.addFilter('isUndefined', function(v) {
    return typeof v === 'undefined';
  });

  $Q.addFilter('isBoolean', function(v) {
    return typeof v === 'boolean';
  });

  $Q.addFilter('isObject', function(v) {
    return v && (typeof v === 'object' || typeof v === 'function');
  });

  $Q.addFilter('isArray', function(v) {
    return v && ((v.constructor && v.constructor.toString().indexOf('Array') > -1) || (typeof v === 'object' && v.constructor === Array));
  });

  $Q.addFilter('isFunction', function(v) {
    return typeof v === 'function';
  });

  $Q.addFilter('matches', function(v, curry) {
    return curry.test(v);
  });

  $Q.addFilter('like', function(v, curry) {
    // TODO: make this work like the real like function
    var re = new RegExp(curry.toLowerCase().replace(/%/g, '.*'));
    return re.test(v.toLowerCase());
  });

  $Q.addFilter('in', function(v, curry) {
    for (var i = 0, l = curry.length; i < l; ++i) {
      if (curry[i] == v) {
        return true;
      }
    }
    return false;
  });

  $Q.addFilter('hasLength', function(v, curry) {
    return v.length === curry;
  });

  $Q.addFilter('custom', function(v, curry) {
    return curry(v);
  });

  /**
   * Add $Q to global namespace
   */
  window.$Q = $Q;

})();
