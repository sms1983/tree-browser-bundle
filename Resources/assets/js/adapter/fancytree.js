/*
 * This file is part of the Symfony CMF package.
 *
 * (c) 2011-2017 Symfony CMF
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import Map from 'core-js/es6/map'
import '../jquery.cmf_context_menu'
import 'fancytree/jquery.fancytree.js'
import 'fancytree/skin-win8/ui.fancytree.css'
import '../../css/fontawesome-style.css'

var cache = new Map();

function getPropertyFromString(name, list) {
    var isOptional = name.substr(0, 1) === '?';
    var nameWithoutPrefix = (isOptional ? name.substr(1) : name);

    if (undefined === list[nameWithoutPrefix]) {
        if (isOptional) {
            return undefined;
        }

        throw 'Attribute "' + props[prop] + '" does not exists';
    }

    return list[nameWithoutPrefix];
}

/**
 * A tree browser adapter for the Fancytree library.
 *
 * @author Wouter J <wouter@wouterj.nl>
 * @see https://github.com/mar10/fancytree
 */
export class FancytreeAdapter {
    constructor(options) {
        if (!window.jQuery || !jQuery.fn.fancytree) {
            throw 'The FancytreeAdapter requires both jQuery and the FancyTree library.';
        }

        if (!options.request) {
            throw 'The FancytreeAdapter requires a request option.';
        }

        this.requestData = options.request;
        this.rootNode = options.root_node || '/';
        this.useCache = undefined === options.use_cache ? true : options.use_cache;

        // available actions (array)
        this.actions = new Array();
        // the Fancytree instance (FancytreeTree)
        this.tree = null;
        // the tree element (jQuery)
        this.$tree = null;
        // a map of path and related keys
        this.pathKeyMap = {};
    }

    bindToElement($elem) {
        if (this.$tree) {
            throw 'Cannot bind to multiple elements.';
        }

        if (!$elem instanceof jQuery) {
            throw  'FancytreeAdapter can only be adapted to a jQuery object.';
        }

        this.$tree = $elem;
        var actions = this.actions;
        var requestNode = this.requestNode;
        var requestNodeToFancytreeNode = (requestNode) => {
            if (requestNode.length === 0) {
                return;
            }

            if ('//' == requestNode.path || '/' == requestNode.path) {
                return requestNodeToFancytreeNode(requestNode.children[Object.keys(requestNode.children)[0]]);
            }

            var key = "" + jQuery.ui.fancytree._nextNodeKey++;
            var fancytreeNode = {
                title: requestNode.label,
                key: key,
                children: [],
                actions: {},
                refPath: requestNode.path.replace('\/', '/').replace('//', '/')
            };

            this.pathKeyMap[fancytreeNode.refPath] = key;

            for (let actionName in actions) {
                var action = actions[actionName];
                var url = action.url;
                if (typeof action.url == 'object' && action.url.hasOwnProperty('data')) {
                    url = getPropertyFromString(action.url.data, requestNode.descriptors);
                }

                if (url === undefined) {
                    continue;
                }
                fancytreeNode['actions'][actionName] = { label: actionName, iconClass: action.icon, url: url };
            }

            var childrenCount = 0;
            for (name in requestNode.children) {
                if (!requestNode.children.hasOwnProperty(name)) {
                    continue;
                }

                var child = requestNodeToFancytreeNode(requestNode.children[name]);
                if (child) {
                    fancytreeNode.children.push(child);
                }
                childrenCount++;
            }

            if (0 != childrenCount) {
                fancytreeNode.folder = true;
                fancytreeNode.lazy = true;

                if (0 === fancytreeNode.children.length) {
                    fancytreeNode.children = null;
                }
            }

            return fancytreeNode;
        };

        var requestData = this.requestData;
        var useCache = this.useCache;
        this.$tree.fancytree({
            // the start data (root node + children)
            source: (useCache && cache.has(this.rootNode)) ? cache.get(this.rootNode) : requestData.load(this.rootNode),

            // lazy load the children when a node is collapsed
            lazyLoad: function (event, data) {
                var path = data.node.data.refPath;
                if (useCache && cache.has(path)) {
                    data.result = cache.get(path);
                } else {
                    var loadData = requestData.load(path);

                    if (Array.isArray(loadData)) {
                        data.result = loadData;
                    } else {
                        data.result = jQuery.extend({
                            data: {}
                        }, loadData);
                    }
                }
            },

            // transform the JSON response into a data structure that's supported by FancyTree
            postProcess: function (event, data) {
                if (data.hasOwnProperty('error') && null != data.error) {
                    data.result = {
                        // todo: maybe use a more admin friendly error message in prod?
                        error: 'An error occured while retrieving the nodes: ' + data.error
                    };

                    return;
                }

                let result = requestNodeToFancytreeNode(data.response);
                let nodeIsDuplicate = function (node, parentPath) {
                    return parentPath == node.refPath;
                };

                if (nodeIsDuplicate(result, data.node.data.refPath)) {
                    result = result.children;
                } else {
                    result = [result];
                }

                if (result.length == 1 && undefined !== result[0].folder) {
                    result[0].expanded = true;
                }

                data.result = result;
                if (useCache) {
                    cache.set(data.node.data.refPath, result);
                }
            },

            // always show the active node
            activeVisible: true
        });

        if (this.actions) {
            this.$tree.cmfContextMenu({
                delegate: 'span.fancytree-title',
                wrapperTemplate: '<ul class="dropdown-menu" style="display:block;"></ul>',
                actionTemplate: '<li role="presentation"><a role="menuitem" href="{{ url }}"><i class="{{ iconClass }}"></i> {{ label }}</li>',
                actions: function ($node) {
                    return jQuery.ui.fancytree.getNode($node).data.actions;
                }
            });
        }

        this.tree = this.$tree.fancytree('getTree');

        this.tree.getNodeByRefPath = function (refPath) {
            return this.findFirst((node) => {
                return node.data.refPath == refPath;
            });
        };
    }

    bindToInput($input) {
        // output active node to input field
        this.$tree.fancytree('option', 'activate', (event, data) => {
            $input.val(data.node.data.refPath);
        });

        var showPath = (path) => {
            if (!this.pathKeyMap.hasOwnProperty(path)) {
                return;
            }

            this.tree.loadKeyPath(generateKeyPath(path), function (node, status) {
                if ('ok' == status) {
                    node.setExpanded();
                    node.setActive();
                }
            });
        };
        var generateKeyPath = (path) => {
            var keyPath = '';
            var refPath = '';
            var subPaths = path.split('/');

            subPaths.forEach((subPath) => {
                if (subPath == '' || !this.pathKeyMap.hasOwnProperty(refPath += '/' + subPath)) {
                    return;
                }

                keyPath += '/' + this.pathKeyMap[refPath];
            });

            return keyPath;
        };

        // use initial input value as active node
        this.$tree.bind('fancytreeinit', function (event, data) {
            showPath($input.val());
        });

        // change active node when the value of the input field changed
        $input.on('change', function (e) {
            showPath($(this).val());
        });
    }

    addAction(name, url, icon) {
        this.actions[name] = { url: url, icon: icon };
    }

    static _resetCache() {
        cache.clear();
    }
}
