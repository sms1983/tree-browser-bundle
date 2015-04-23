/**
 * A tree browser adapter for the Fancytree library.
 *
 * @author Wouter J <wouter@wouterj.nl>
 * @see https://github.com/mar10/fancytree
 */
var FancytreeAdapter = function (requestData) {
    if (!window.jQuery || !jQuery.fn.fancytree) {
        throw 'The FancytreeAdapter requires both jQuery and the FancyTree library.';
    }

    var requestNodeToFancytreeNode = function (requestNode) {
        var title = requestNode.path.substr(requestNode.path.lastIndexOf('/') + 1) || '/';
        var fancytreeNode = {
            // fixme: use sonata enhancer to get node name based on Admin#toString
            title: title,
            // fixme: also put the current node name in the JSON response, not just the complete path
            key: title,
            children: []
        };

        for (name in requestNode.children) {
            if (!requestNode.children.hasOwnProperty(name)) {
                continue;
            }

            fancytreeNode.children.push(requestNodeToFancytreeNode(requestNode.children[name]));
        }

        if (fancytreeNode.children.length) {
            fancytreeNode.folder = true;
            fancytreeNode.lazy = true;
        }

        return fancytreeNode;
    };
    // FancyTree instance
    var tree;
    // jQuery instance of the tree output element
    var $tree;

    return {
        bindToElement: function ($elem) {
            if (!$elem instanceof jQuery) {
                throw  'FancytreeAdapter can only be adapted to a jQuery object.';
            }

            $tree = $elem;

            $tree.fancytree({
                // the start data (root node + children)
                source: requestData.load('/'),

                // lazy load the children when a node is collapsed
                lazyLoad: function (event, data) {
                    data.result = jQuery.merge({
                        data: {}
                    }, requestData.load(data.node.getKeyPath()));
                },

                // transform the JSON response into a data structure that's supported by FancyTree
                postProcess: function (event, data) {
                    if (null == data.error) {
                        data.result = requestNodeToFancytreeNode(data.response).children;
                        if (data.result.length == 1) {
                            data.result[0].expanded = true;
                        }
                    } else {
                        data.result = {
                            // todo: maybe use a more admin friendly error message in prod?
                            error: 'An error occured while retrieving the nodes: ' + data.error
                        };
                    }
                },

                // always show the active node
                activeVisible: true
            });

            tree = $tree.fancytree('getTree');
        },

        bindToInput: function ($input) {
            // output active node to input field
            $tree.fancytree('option', 'activate', function(event, data) {
                $input.val(data.node.getKeyPath());
            });

            var showKey = function (key) {
                tree.loadKeyPath(key, function (node, status) {
                    if ('ok' == status) {
                        node.setExpanded();
                        node.setActive();
                    }
                });
            };

            // use initial input value as active node
            $tree.bind('fancytreeinit', function (event, data) {
                showKey($input.val());
            });

            // change active node when the value of the input field changed
            $input.on('change', function (e) {
                showKey($(this).val());
            });
        }
    };
};