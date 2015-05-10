/*

Copyright 2014, 2015 Roland Bouman (roland.bouman@gmail.com)

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

*/
var XmlaTreeView;
(function(){

(XmlaTreeView = function(conf){
  this.xmla = conf.xmla;
  this.schemaTreePane = new ContentPane({
    classes: ["tree", "schemas"]
  });
  this.cubeTreePane = new ContentPane({
    classes: ["tree", "cube-contents"]
  });
  this.splitPane = new SplitPane({
    classes: "xmlatreeview",
    firstComponent: this.schemaTreePane,
    secondComponent: this.cubeTreePane,
    orientation: SplitPane.orientations.horizontal
  });
  if (iDef(conf.catalogNodesInitiallyFlattened)) {
    this.catalogNodesInitiallyFlattened = conf.catalogNodesInitiallyFlattened;
  }
  if (iDef(conf.dimensionNodesInitiallyFlattened)) {
    this.dimensionNodesInitiallyFlattened = conf.dimensionNodesInitiallyFlattened;
  }
  arguments.callee._super.apply(this, arguments);
}).prototype = {
  //whether catalog nodes should initially be hidden
  catalogNodesInitiallyFlattened: true,
  //whether dimension nodes should initially be hidden
  dimensionNodesInitiallyFlattened: true,
  clearTreePane: function(treePane){
    var treePaneDom = treePane.getDom();
    var childNodes = treePaneDom.childNodes, n = childNodes.length, i, childNode, treeNode;
    for (i = 0; i < n; i++){
      childNode = childNodes[i];
      if (!hCls(childNode, TreeNode.prefix)){
        continue;
      }
      treeNode = TreeNode.getInstance(childNode.id);
      treeNode.removeFromParent();
    }
    treePane.clearAll();
  },
  getDescriptionContentType: function(description){
    description = description.trim();
    var type;
    var len = description.length;
    if (/^((https?:\/\/)?(((\w+)(\.[\w]+)*|(\d{1,3})(\.\d{1,3}){3})(:\d+)?)\/)?(\w+\/)*([\w\.]+)(\?[\w\.=\&]*)?$/.test(description)) {
      type = "url";
    }
    else
    if (description.indexOf("<") === 0 && description.indexOf(len-1) === ">") {
      type = "xml";
    }
    else
    if (description === "") {
      type = "empty";
    }
    else {
      type = "text";
    }
    return type;
  },
  createNodeTooltipAndInfoLabel: function(description){
    var type = this.getDescriptionContentType(description);
    var tooltip = "", infoLabel = "";
    switch (type) {
      case "url":
        tooltip = gMsg("Click on the information icon for a description.");
        infoLabel = "<span class=\"info-icon\" data-url=\"" + description + "\"/>"
        break;
      case "xml":
      case "text":
        tooltip = description;
        infoLabel = "";
        break;
      case "empty":
      default:
        break;
    }
    return {
      tooltip: tooltip,
      infoLabel: infoLabel
    };
  },
  init: function(){
    this.fireEvent("busy");
    var me = this;
    var xmla = me.xmla;
    var schemaTreePane = me.schemaTreePane;
    this.clearTreePane(schemaTreePane);
    var schemaTreePaneDom = schemaTreePane.getDom();

    var catalogQueueIndex = -1;
    var catalogQueue = [];

    function doCatalogQueue(){
      if (!(++catalogQueueIndex < catalogQueue.length)) return false;
      var providerNode = catalogQueue[catalogQueueIndex];
      var conf = providerNode.conf;
      var metadata = conf.metadata;
      xmla.discoverDBCatalogs({
        url: metadata.URL,
        properties: {
          DataSourceInfo: metadata.DataSourceInfo
        },
        error: function(xmla, options, error){
          me.fireEvent("error", error);
        },
        success: function(xmla, options, rowset){
          rowset.eachRow(function(row){
            var tooltipAndInfoLabel = me.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
            var state = TreeNode.states.expanded;
            var objectName = row.CATALOG_NAME;
            var treeNode = new TreeNode({
              classes: "catalog",
              state: state,
              id: conf.id + ":catalog:" + row.CATALOG_NAME,
              parentTreeNode: providerNode,
              objectName: objectName,
              title: objectName + tooltipAndInfoLabel.infoLabel,
              tooltip: tooltipAndInfoLabel.tooltip || objectName,
              metadata: row
            });
            cubeQueue.push(treeNode);
          });
          if (doCatalogQueue() === false) doCubeQueue();
        }
      });
    }

    var cubeQueueIndex = -1;
    var cubeQueue = [];
    function doCubeQueue(){
      if (!(++cubeQueueIndex < cubeQueue.length)) {
        me.fireEvent("done");
        return false;
      }
      var catalogNode = cubeQueue[cubeQueueIndex];
      var providerNode = catalogNode.getParentTreeNode();
      var conf = catalogNode.conf;
      var catalog = conf.metadata.CATALOG_NAME;
      var metadata = providerNode.conf.metadata;
      xmla.discoverMDCubes({
        url: metadata.URL,
        properties: {
          DataSourceInfo: metadata.DataSourceInfo,
          Catalog: catalog
        },
        error: function(xmla, options, error){
          me.fireEvent("error", error);
        },
        success: function(xmla, options, rowset){
          rowset.eachRow(function(row){
            var objectName = row.CUBE_CAPTION || row.CUBE_NAME;
            var title = objectName;
            var catalogPrefix = "<span class=\"label label-prefix\">" + catalog + "</span>";
            var tooltipAndInfoLabel = me.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
            title = catalogPrefix + title + tooltipAndInfoLabel.infoLabel;
            var tooltip = tooltipAndInfoLabel.tooltip || row.CUBE_NAME;
            var treeNode = new TreeNode({
              classes: "cube",
              state: TreeNode.states.leaf,
              id: conf.id + ":cube:" + row.CUBE_NAME,
              objectName: objectName,
              parentTreeNode: catalogNode,
              title: title,
              tooltip: tooltip,
              metadata: row
            });
          });
          if (!showCatalogNodesCheckbox.checked) {
            catalogNode.setState(TreeNode.states.flattened);
          }
          doCubeQueue();
        }
      });
    }

    var showCatalogNodesCheckbox = cEl("INPUT", {
      type: "checkbox"
    });
    showCatalogNodesCheckbox.checked = !this.catalogNodesInitiallyFlattened;
    listen(showCatalogNodesCheckbox, "click", this.showCatalogNodes, this);

    cEl("DIV", {
      "class": "show-catalog-nodes"
    }, [
      showCatalogNodesCheckbox,
      cEl("SPAN", {
      }, gMsg("Show catalog nodes"))
    ], schemaTreePaneDom);

    xmla.discoverDataSources({
      error: function(xmla, options, error){
        me.fireEvent("error", error);
      },
      success: function(xmla, options, rowset){
        rowset.eachRow(function(row){
          //first, check the provider type.
          //we only handle MDP providers (OLAP)
          var isMDP = false;
          var providerType = row.ProviderType;
          if (iArr(providerType)) {
            var n = providerType.length;
            for (var i = 0; i < n; i++){
              if (providerType[i] !== "MDP") {
                continue;
              }
              isMDP = true;
              break;
            }
          }
          else
          if (providerType === "MDP") {
            isMDP = true;
          }
          if (!isMDP) {
            return;
          }

          //now, check if we are dealing with a relative URL.
          //if so, then prepend with the url of the preceding XMLA request
          //(if we don't, it will be resolved against the location of the current document, which is clearly wrong)
          var url = parseUri(row.URL);
          if (url.isRelative) {
            var url = row.URL;
            row.URL = options.url;
            //If the original url does not end with a slash, add it.
            if (options.url.charAt(options.url.length - 1) !== "/") {
              row.URL += "/";
            }
            row.URL += url;
          }

          //For now, overwrite the value of the URL field.
          //Too many servers misbehave when they return an actual value
          //see http://issues.iccube.com/issue/ic3pub-62
          row.URL = options.url;

          //Render MDP providers as treenodes.
          var treeNode = new TreeNode({
            classes: "datasource",
            state: TreeNode.states.expanded,
            id: "datasource:" + row.DataSourceName,
            parentElement: schemaTreePaneDom,
            title: row.DataSourceName,
            tooltip: row.Description || row.DataSourceName,
            metadata: row
          });

          //push to the queue so we can find the catalogs in a next round.
          catalogQueue.push(treeNode);
        });
        doCatalogQueue();
      }
    });
    this.schemaTreeListener = new TreeListener({container: this.schemaTreePane.getDom()});
    this.cubeSelection = new TreeSelection({treeListener: this.schemaTreeListener});

    this.cubeSelection.listen({
      scope: this,
      beforeChangeSelection: function(cubeSelection, event, data){
        var d = data.data;
        var event = d.event;
        var target = event.getTarget();
        var ret;
        if (hCls(target, "info-icon")){
          var url = gAtt(target, "data-url");
          this.fireEvent("requestinfo", {
            title: d.treeNode.conf.objectName,
            url: url,
          });
          ret = false;
        }
        else {
          var selection = data.newSelection[0];
          switch (selection.conf.classes) {
            case "cube":
              if (this.fireEvent("beforeLoadCube", selection) === false) {
                ret = false;
              }
              else {
                ret = true;
              }
              break;
            default:
              ret = true;
          }
        }
        return ret;
      },
      selectionChanged: function(cubeSelection, event, data){
        if (!data.newSelection || !data.newSelection.length) {
          return;
        }
        var selection = data.newSelection[0];
        switch (selection.conf.classes) {
          case "cube":
            this.loadCube(selection);
            break;
          default:
        }
      }
    });
    var cubeTreePaneDom = this.cubeTreePane.getDom();
    this.cubeTreeListener = new TreeListener({
      container: cubeTreePaneDom,
      listeners: {
        nodeClicked: function(treeListener, event, d){
          var target = d.event.getTarget();
          if (hCls(target, "info-icon")) {
            var url = gAtt(target, "data-url");
            this.fireEvent("requestinfo", {
              title: d.treeNode.conf.objectName,
              url: url,
            });
          }
        },
        scope: this
      }
    });
  },
  eachDatasourceNode: function(callback, scope){
    var schemaTreePane = this.schemaTreePane;
    var schemaTreePaneDom = schemaTreePane.getDom();
    var childNodes = schemaTreePaneDom.childNodes, n = childNodes.length, childNode, i;
    for (i = 0; i < n; i++) {
      childNode = childNodes[i];
      if (!hCls(childNode, "datasource")) {
        continue;
      }
      if (callback.call(scope, TreeNode.getInstance(childNode.id), i) === false) {
        return false;
      }
    }
    return true;
  },
  eachCatalogNode: function(callback, scope) {
    if(this.eachDatasourceNode(function(datasourceNode, i){
      if (datasourceNode.eachChild(callback, scope) === false) {
        return false;
      }
    }, scope) === false){
      return false;
    }
    return true;
  },
  showCatalogNodes: function(event){
    var target = event.getTarget(), state;
    if (target.checked) {
      state = TreeNode.states.unflattened;
    }
    else {
      state = TreeNode.states.flattened;
    }
    this.eachCatalogNode(function(catalogNode, index){
      catalogNode.setState(state);
    }, this)
  },
  eachDimensionNode: function(callback, scope) {
    var cubeTreePane = this.cubeTreePane;
    var cubeTreePaneDom = cubeTreePane.getDom();
    var childNodes = cubeTreePaneDom.childNodes, n = childNodes.length, childNode, i;
    for (i = 0; i < n; i++) {
      childNode = childNodes[i];
      if (!hCls(childNode, "dimension")) {
        continue;
      }
      if (callback.call(scope, TreeNode.getInstance(childNode.id), i) === false) {
        return false;
      }
    }
    return true;
  },
  showDimensionNodes: function(event){
    var target = event.getTarget(), state;
    if (target.checked) {
      state = TreeNode.states.unflattened;
    }
    else {
      state = TreeNode.states.flattened;
    }
    this.eachDimensionNode(function(dimensionNode, index){
      if (dimensionNode.getChildNodeCount() <= 1) {
        //This dimension has only 1 hierarchy;
        //keep it flattened.
        return;
      }
      dimensionNode.setState(state);
    }, this)
  },
  checkStartDrag: function(event, ddHandler){
    var target = event.getTarget();
    if (!hCls(target, "label")) {
      return false;
    }
    var treeNode = TreeNode.lookup(target);
    if (!treeNode) {
      return false;
    }
    var classes = confCls(treeNode.conf.classes);
    className = classes[0];
    var defaultMember;
    switch (className) {
      case "measures":
      case "hierarchy":
      case "measure":
      case "level":
      case "member":
      case "property":
        this.getCubeTreePane().getDom().style.overflow = "hidden";
        break;
      default:
        return false;
    }
    var treeNodeConf = treeNode.conf;
    var info = {
      dragOrigin: this,
      label: treeNode.getTitle(),
      metadata: treeNodeConf.metadata,
      classes: classes,
      className: className
    };
    if (treeNodeConf.defaultMember) {
      info.defaultMember = treeNodeConf.defaultMember;
    }
    return info;
  },
  notifyEndDrag: function(event, dndHandler){
    this.getCubeTreePane().getDom().style.overflow = "";
  },
  renderAllLevel: function(conf, level) {
    var me = this;
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var idPostfix =  ":level:" + level.LEVEL_UNIQUE_NAME;
    var levelTreeNode = TreeNode.getInstance(hierarchyTreeNode.getId() + idPostfix);
    conf.levelTreeNode = levelTreeNode;
    var hierarchyMetaData = hierarchyTreeNode.conf.metadata;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: hierarchyMetaData.HIERARCHY_UNIQUE_NAME,
      MEMBER_UNIQUE_NAME: hierarchyMetaData.ALL_MEMBER
    };
    this.xmla.discoverMDMembers({
      url: url,
      properties: properties,
      restrictions: restrictions,
      success: function(xmla, options, rowset){
        //actually render the member tree nodes residing beneath the level tree nodes
        rowset.eachRow(function(row){
          me.renderLevelMemberNode(conf, row);
        });
        //done rendering member treenodes
        conf.callback();
        me.fireEvent("done");
      },
      error: function(xmla, options, error){
        conf.callback();
        me.fireEvent("error", error);
      }
    });
  },
  renderChildMemberNodes: function(conf){
    var me = this;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog,
      Format: "Multidimensional",
      AxisFormat: "TupleFormat",
    };
    var parentNode = conf.parentNode,
        parentNodeConf = parentNode.conf,
        metadata = parentNodeConf.metadata,
        mdx = "WITH MEMBER [Measures].numChildren " +
              "AS " + metadata.HIERARCHY_UNIQUE_NAME  + ".CurrentMember.Children.Count " +
              "SELECT CrossJoin(" + metadata.MEMBER_UNIQUE_NAME + ".Children," +
                      "[Measures].numChildren) ON COLUMNS " +
              "FROM [" + metadata.CUBE_NAME + "]"
    ;
    me.xmla.execute({
      url: url,
      properties: properties,
      statement: mdx,
      cube: metadata.CUBE_NAME,
      hierarchy: metadata.HIERARCHY_UNIQUE_NAME,
      metadata: metadata,
      //requestType: options.requestType,
      success: function(xmla, req, resp){
        var cellset = resp.getCellset();
        resp.getColumnAxis().eachTuple(function(tuple){
          cellset.nextCell();
          var childCount = cellset.cellValue(),
              metadata = req.metadata,
              member = tuple.members[0],
              memberUniqueName = member.UName,
              memberCaption = member.Caption,
              nodeId
          ;
          new TreeNode({
            id: parentNode.conf.id + ":" + memberUniqueName,
            parentTreeNode: parentNode,
            classes: "member",
            title: memberCaption,
            tooltip: memberUniqueName,
            state: childCount ? TreeNode.states.collapsed : TreeNode.states.leaf,
            metadata: merge({
              MEMBER_UNIQUE_NAME: memberUniqueName,
              MEMBER_CAPTION: memberCaption,
              LEVEL_UNIQUE_NAME: member.LName,
              LEVEL_NUMBER: member.LNum,
              CHILDREN_CARDINALITY: childCount
            }, metadata),
            loadChildren: function(callback){
              conf.parentNode = this;
              conf.callback = callback;
              me.renderChildMemberNodes(conf);
            }
          });
        });
        resp.close();
        conf.callback();
      },
      error: function(){
        conf.callback();
        debugger;
      }
    });
  },
  renderLevelMemberNode: function(conf, row){
    var me = this;
    var membersTreeNode = conf.membersTreeNode || conf.levelTreeNode;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog,
      Format: "Multidimensional",
      AxisFormat: "TupleFormat",
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: row.HIERARCHY_UNIQUE_NAME,
      LEVEL_UNIQUE_NAME: row.LEVEL_UNIQUE_NAME
    };
    var memberNodeId = membersTreeNode.conf.id  + ":" + row.MEMBER_UNIQUE_NAME;
    new TreeNode({
      parentTreeNode: membersTreeNode,
      classes: "member",
      id: memberNodeId,
      title: row.MEMBER_CAPTION || row.MEMBER_NAME,
      metadata: row,
      loadChildren: function(callback){
        conf.parentNode = this;
        conf.callback = callback;
        me.renderChildMemberNodes(conf);
      }
    });
  },
  renderLevelMemberNodes: function(conf){
    var me = this;
    var membersTreeNode = conf.membersTreeNode;
    var row = membersTreeNode.conf.metadata;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: row.HIERARCHY_UNIQUE_NAME,
      LEVEL_UNIQUE_NAME: row.LEVEL_UNIQUE_NAME
    };
    this.xmla.discoverMDMembers({
      url: url,
      properties: properties,
      restrictions: restrictions,
      success: function(xmla, options, rowset){
        //actually render the member tree nodes residing beneath the level tree nodes
        rowset.eachRow(function(row){
          me.renderLevelMemberNode(conf, row);
        });
        //done rendering member treenodes
        conf.callback();
        me.fireEvent("done");
      },
      error: function(xmla, options, error){
        conf.callback();
        me.fireEvent("error", error);
      }
    });
  },
  renderLevelMembersNode: function(conf, row){
    var me = this;
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var idPostfix =  ":level:" + row.LEVEL_UNIQUE_NAME;
    var id = hierarchyTreeNode.conf.id + idPostfix;
    var title = row.LEVEL_CARDINALITY + " " + gMsg("Members");
    new TreeNode({
      parentTreeNode: TreeNode.getInstance(hierarchyTreeNode.getId() + idPostfix),
      classes: "members",
      id: id + ":members",
      title: title,
      tooltip: title,
      metadata: row,
      state: TreeNode.states.collapsed,
      loadChildren: function(callback){
        conf.membersTreeNode = this;
        conf.callback = callback;
        me.renderLevelMemberNodes(conf);
      }
    })
  },
  renderLevelPropertyNode: function(conf, row) {
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var idPostfix =  ":level:" + row.LEVEL_UNIQUE_NAME;
    var levelTreeNode = TreeNode.getInstance(hierarchyTreeNode.getId() + idPostfix);
    var id = hierarchyTreeNode.conf.id + idPostfix;
    if (!levelTreeNode) {
      //the level tree node might not have been created if it was marked as not visible
      return;
    }
    var tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
    var objectName = row.PROPERTY_CAPTION || row.PROPERTY_NAME;
    var title = objectName;
    var tooltip = tooltipAndInfoLabel.tooltip || title;
    title = title + tooltipAndInfoLabel.infoLabel;
    new TreeNode({
      parentTreeNode: levelTreeNode,
      classes: "property",
      id: id + ":property:" + row.PROPERTY_NAME,
      objectName: objectName,
      title: title,
      tooltip: tooltip,
      state: TreeNode.states.leaf,
      metadata: row
    })
  },
  renderLevelPropertyNodes: function(conf) {
    var me = this;
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var hierarchyMetaData = hierarchyTreeNode.conf.metadata;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: hierarchyMetaData.HIERARCHY_UNIQUE_NAME
    };
    me.xmla.discoverMDProperties({
      url: url,
      properties: properties,
      restrictions: restrictions,
      success: function(xmla, options, rowset){
        rowset.eachRow(function(row){
          me.renderLevelPropertyNode(conf, row);
        });
        conf.levelsRowset.eachRow(function(row){
          if (!row.LEVEL_IS_VISIBLE) {
            return;
          }
          if (row.LEVEL_TYPE === 1){  //All level
            me.renderAllLevel(conf, row);
          }
          else {
            me.renderLevelMembersNode(conf, row);
          }
        });
        conf.callback();
        me.fireEvent("done");
      },
      error: function(xmla, options, error){
        conf.callback();
        me.fireEvent("error", error);
      }
    });
  },
  renderLevelTreeNode: function(conf, row){
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var id = hierarchyTreeNode.conf.id + ":level:" + row.LEVEL_UNIQUE_NAME;
    var levelCaption = row.LEVEL_CAPTION;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: row.HIERARCHY_UNIQUE_NAME,
      LEVEL_UNIQUE_NAME: row.LEVEL_UNIQUE_NAME
    };
    var tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
    var objectName = row.LEVEL_CAPTION || row.LEVEL_NAME;
    var title = objectName;
    var tooltip = tooltipAndInfoLabel.tooltip || title;
    title = title + tooltipAndInfoLabel.infoLabel;
    //if this is the all level, then flatten it to make the tree tidier.
    //typically we are not very interested in the "all" level (although the "all" member can be useful sometimes)
    var state = row.LEVEL_TYPE === 1 ? TreeNode.states.flattened : TreeNode.states.expanded;
    new TreeNode({
      parentTreeNode: hierarchyTreeNode,
      classes: ["level", "leveltype" + row.LEVEL_TYPE, "levelunicity" + row.LEVEL_UNIQUE_SETTINGS],
      id: id,
      objectName: objectName,
      title: title,
      tooltip: tooltip,
      metadata: row,
      state: state
    });
  },
  //levels with 10 members or less will get their members folder flattened.
  levelLowCardinality: 10,
  renderLevelTreeNodes: function(conf){
    var me = this;
    me.fireEvent("busy");
    var hierarchyTreeNode = conf.hierarchyTreeNode;
    var row = hierarchyTreeNode.conf.metadata;
    var hierarchyCaption = row.HIERARCHY_CAPTION;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: row.HIERARCHY_UNIQUE_NAME
    };
    me.xmla.discoverMDLevels({
      url: conf.url,
      properties: properties,
      restrictions: restrictions,
      success: function(xmla, options, rowset){
        //create a treenode for each level
        rowset.eachRow(function(row){
          if (!row.LEVEL_IS_VISIBLE) {
            return;
          }
          row.HIERARCHY_CAPTION = hierarchyCaption;
          me.renderLevelTreeNode(conf, row);
        });

        rowset.reset();
        conf.levelsRowset = rowset;

        me.renderLevelPropertyNodes(conf);
      },
      error: function(xmla, options, error){
        conf.callback();
        me.fireEvent("error", error);
      },
    });
  },
  renderDimensionTreeNode: function(conf, row){
    var classes = ["dimension", "dimensiontype" + row.DIMENSION_TYPE, TreeNode.states.flattened];
    var tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
    var objectName = row.DIMENSION_CAPTION || row.DIMENSION_NAME;
    var title = objectName;
    var tooltip = tooltipAndInfoLabel.tooltip || title;
    title = title + tooltipAndInfoLabel.infoLabel;
    new TreeNode({
      state: TreeNode.states.expanded,
      parentElement: this.cubeTreePane.getDom(),
      classes: classes,
      id: "dimension:" + row.DIMENSION_UNIQUE_NAME,
      objectName: objectName,
      title: title,
      tooltip: tooltip,
      metadata: row
    });
  },
  renderDimensionTreeNodes: function(conf){
    var me = this;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube
    };
    this.xmla.discoverMDDimensions({
      url: conf.url,
      properties: properties,
      restrictions: restrictions,
      error: function(xmla, options, error){
        me.fireEvent("error", error);
      },
      success: function(xmla, options, rowset) {
        //for each dimension, add a treenode.
        rowset.eachRow(function(row){
          //don't render invisible dimensions
          if (row.DIMENSION_IS_VISIBLE === false) {
            return;
          }
          //if this dimension happens to be a measure dimension, don't render it.
          //We already have measures
          if (row.DIMENSION_TYPE === Xmla.Rowset.MD_DIMTYPE_MEASURE) {
            conf.measuresTreeNode.conf.metadata = row;
            return;
          }
          //actually add a treenode for the hierarchy.
          me.renderDimensionTreeNode(conf, row);
        });
        //add hierarchies
        me.renderHierarchyTreeNodes(conf);
        //done rendering hierarchy treenodes
        me.fireEvent("done");
      }
    });
  },
  getHierarchyTreeNodeId: function(hierarchyUniqueName){
    if (iObj(hierarchyUniqueName)){
      hierarchyUniqueName = hierarchyUniqueName.HIERARCHY_UNIQUE_NAME;
    }
    return "hierarchy:" + hierarchyUniqueName;
  },
  getHierarchyTreeNode: function(hierarchyUniqueName){
    var id = this.getHierarchyTreeNodeId(hierarchyUniqueName);
    return TreeNode.getInstance("node:" + id);
  },
  getHierarchyMetadata: function(hierarchyUniqueName){
    var hierarchyTreeNode = this.getHierarchyTreeNode(hierarchyUniqueName);
    return hierarchyTreeNode.conf.metadata;
  },
  getDefaultMember: function(conf, defaultMemberQueue, defaultMemberQueueIndex){
    if (defaultMemberQueueIndex >= defaultMemberQueue.length) {
      return;
    }
    var me = this;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var hierarchyTreeNode = defaultMemberQueue[defaultMemberQueueIndex];
    var hierarchyTreeNodeConf = hierarchyTreeNode.conf;
    var hierarchyMetadata = hierarchyTreeNodeConf.metadata;
    var restrictions = {
      CUBE_NAME: conf.cube,
      HIERARCHY_UNIQUE_NAME: hierarchyMetadata.HIERARCHY_UNIQUE_NAME,
      MEMBER_UNIQUE_NAME: hierarchyMetadata.DEFAULT_MEMBER
    };
    this.xmla.discoverMDMembers({
      hierarchyTreeNodeConf: hierarchyTreeNodeConf,
      url: url,
      properties: properties,
      restrictions: restrictions,
      success: function(xmla, options, rowset){
        //actually render the member tree nodes residing beneath the level tree nodes
        rowset.eachRow(function(row){
          hierarchyTreeNodeConf.defaultMember = row;
        });
        me.getDefaultMember(conf, defaultMemberQueue, ++defaultMemberQueueIndex);
      },
      error: function(xmla, options, error){
      }
    });
  },
  renderHierarchyTreeNode: function(conf, row){
    var me = this;
    var dimensionNode = TreeNode.getInstance("node:dimension:" + row.DIMENSION_UNIQUE_NAME);
    if (dimensionNode.isFlattened() && dimensionNode.getChildNodeCount() >= 1) {
      dimensionNode.setState(TreeNode.states.unflattened);
    }
    var dimensionTitle = dimensionNode.conf.objectName;
    var objectName = row.HIERARCHY_CAPTION || row.HIERARCHY_NAME;
    var hierarchyTitle = objectName;
    if (dimensionTitle !== hierarchyTitle) {
      hierarchyTitle = "<span class=\"label label-prefix\">" + dimensionTitle + "</span>" + hierarchyTitle;
    }
    var tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
    var tooltip = tooltipAndInfoLabel.tooltip || hierarchyTitle;
    title = hierarchyTitle+ tooltipAndInfoLabel.infoLabel;

    var hierarchyTreeNode = new TreeNode({
      state: TreeNode.states.collapsed,
      parentTreeNode: dimensionNode,
      classes: ["hierarchy", "dimensiontype" + row.DIMENSION_TYPE],
      id: this.getHierarchyTreeNodeId(row),
      objectName: objectName,
      title: title,
      tooltip: tooltip,
      metadata: row,
      loadChildren: function(callback) {
        //get the level of the hierarchy.
        conf.hierarchyTreeNode = this;
        conf.callback = callback;
        me.renderLevelTreeNodes(conf);
      }
    });
    return hierarchyTreeNode;
  },
  renderHierarchyTreeNodes: function(conf){
    var me = this;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube
    };
    this.xmla.discoverMDHierarchies({
      url: conf.url,
      properties: properties,
      restrictions: restrictions,
      error: function(xmla, options, error){
        me.fireEvent("error", error);
      },
      success: function(xmla, options, rowset) {
        //for each hierarchy, add a treenode.
        var defaultMemberQueue = [];
        var hasMultipleHierarchies = false;
        rowset.eachRow(function(row){
          //if this hierarchy happens to be a measure hierarchy, don't render it.
          //We already have measures
          if (row.DIMENSION_TYPE === Xmla.Rowset.MD_DIMTYPE_MEASURE) {
            if (row.DEFAULT_MEMBER) {
              //me.getMeasureTreeNode(row.DEFAULT_MEMBER);
              //defaultMemberQueue.push(conf.measuresTreeNode);
              me.setDefaultMeasure(row.DEFAULT_MEMBER)
            }
            conf.measuresTreeNode.conf.metadata = row;
            conf.measuresTreeNode.setId(
              me.getHierarchyTreeNodeId(row.HIERARCHY_UNIQUE_NAME)
            );
            return;
          }
          else
          //if the hierarchy is not visible, don't render it.
          if (!row.HIERARCHY_IS_VISIBLE || !row.DIMENSION_IS_VISIBLE) {
            return;
          }
          //actually add a treenode for the hierarchy.
          var hierarchyTreeNode = me.renderHierarchyTreeNode(conf, row);
          if (hasMultipleHierarchies === false && hierarchyTreeNode.getParentTreeNode().getChildNodeCount() > 1) {
            hasMultipleHierarchies = true;
          }
          if (row.DEFAULT_MEMBER) {
            defaultMemberQueue.push(hierarchyTreeNode);
          }
        });
        if (hasMultipleHierarchies) {
          me.createShowDimensionNodesCheckbox();
        }
        me.getDefaultMember(conf, defaultMemberQueue, 0);
        //done rendering hierarchy treenodes
        me.fireEvent("done");
        me.fireEvent("cubeLoaded");
      }
    });
  },
  setDefaultMeasure: function(measureUniqueName){
    var measureTreeNode = this.getMeasureTreeNode(measureUniqueName);
    var measuresTreeNode = this.getMeasuresTreeNode();
    measuresTreeNode.conf.defaultMember = measureTreeNode.conf.metadata;
  },
  getMeasureTreeNodeId: function(measureUniqueName){
    return "measure:" + measureUniqueName;
  },
  getMeasureTreeNode: function(measureUniqueName){
    var id = this.getMeasureTreeNodeId(measureUniqueName);
    return TreeNode.getInstance("node:" + id);
  },
  getMeasuresTreeNode: function(){
    var id = this.getMeasuresTreeNodeId();
    return TreeNode.getInstance("node:" + id);
  },
  renderMeasureNode: function(conf, row){
    var tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(row.DESCRIPTION);
    var objectName = row.MEASURE_CAPTION || row.MEASURE_NAME;
    var title = objectName;
    var tooltip = tooltipAndInfoLabel.tooltip || title;
    title = title + tooltipAndInfoLabel.infoLabel;
    new TreeNode({
      state: TreeNode.states.leaf,
      parentTreeNode: conf.measuresTreeNode,
      classes: ["measure", "aggregator" + row.MEASURE_AGGREGATOR],
      id: this.getMeasureTreeNodeId(row.MEASURE_UNIQUE_NAME),
      objectName: objectName,
      title: title,
      tooltip: tooltip,
      metadata: row
    });
  },
  renderMeasureNodes: function(conf){
    var me = this;
    var measuresTreeNode = conf.measuresTreeNode;
    var measuresTreeNodeConf = measuresTreeNode.conf;
    var measuresMetadata = measuresTreeNodeConf.metadata;
    var url = conf.url;
    var properties = {
      DataSourceInfo: conf.dataSourceInfo,
      Catalog: conf.catalog
    };
    var restrictions = {
      CUBE_NAME: conf.cube
    };
    this.xmla.discoverMDMeasures({
      url: url,
      properties: properties,
      restrictions: restrictions,
      error: function(xmla, options, error){
        me.fireEvent("error", error);
      },
      success: function(xmla, options, rowset){
        //collect the measures so we can sort them
        var measures = [];
        rowset.eachRow(function(row){
          if (!row.MEASURE_IS_VISIBLE) {
            return;
          }
          measures.push(row);
        });

        //sort the measures
        measures.sort(function(a, b) {
          var labelA = a.MEASURE_CAPTION || a.MEASURE_NAME;
          var labelB = b.MEASURE_CAPTION || b.MEASURE_NAME;
          var ret;
          if (labelA > labelB) {
            ret = 1;
          }
          else
          if (labelA < labelB) {
            ret = -1;
          }
          else {
            ret = 0;
          }
          return ret;
        });
        //Add a treenode for each measure.
        for (var i = 0, n = measures.length; i < n; i++){
          me.renderMeasureNode(conf, measures[i]);
        }

        //All measures are now in the treeview. Let's add dimensions (beneath the measures level).
        me.renderDimensionTreeNodes(conf);
      }
    });
  },
  getMeasuresTreeNodeId: function(){
    return "[Measures]";
  },
  renderMeasuresNode: function(conf){
    conf.measuresTreeNode = new TreeNode({
      state: TreeNode.states.expanded,
      parentElement: this.cubeTreePane.getDom(),
      classes: ["measures", "hierarchy", "dimensiontype" + Xmla.Rowset.MD_DIMTYPE_MEASURE],
      id: this.getMeasuresTreeNodeId(),
      title: gMsg("Measures"),
      tooltip: gMsg("Measures")
    });
    this.renderMeasureNodes(conf);
  },
  getCurrentCubeTreeNode: function(){
    var cubeTreeNode = this.currentCubeTreeNode;
    if (!cubeTreeNode) {
      cubeTreeNode = null;
    }
    return cubeTreeNode;
  },
  getCurrentCatalogTreeNode: function(){
    var cubeTreeNode = this.getCurrentCubeTreeNode();
    if (!cubeTreeNode) {
      return null;
    }
    return cubeTreeNode.getParentTreeNode();
  },
  getCurrentDatasourceTreeNode: function(){
    var currentCatalogTreeNode = this.getCurrentCatalogTreeNode();
    if (!currentCatalogTreeNode) {
      return null;
    }
    return currentCatalogTreeNode.getParentTreeNode();
  },
  createShowDimensionNodesCheckbox: function(){
    var cubeTreePane = this.cubeTreePane;
    var cubeTreePaneDom = cubeTreePane.getDom();
    //checkbox to show / hide dimension level
    var showDimensionNodesCheckbox = this.showDimensionNodesCheckbox = cEl("INPUT", {
      type: "checkbox"
    });
    showDimensionNodesCheckbox.checked = !this.dimensionNodesInitiallyFlattened;
    listen(showDimensionNodesCheckbox, "click", this.showDimensionNodes, this);

    var div = cEl("DIV", {
      "class": "show-dimension-nodes",
      id: "show-dimension-nodes"
    }, [
      cEl("DIV", {
        "class": "tooltip"
      }, gMsg("Check to show multi-hierarchy dimension nodes. Uncheck to hide all dimension nodes.")),
      showDimensionNodesCheckbox,
      cEl("SPAN", {
      }, gMsg("Show dimension nodes"))
    ]);
    cubeTreePaneDom.insertBefore(div, cubeTreePaneDom.firstChild);
  },
  loadCube: function(cubeTreeNode){
    this.cubeSelection._setSelection({
      oldSelection: this.cubeSelection.getSelection(),
      newSelection: [cubeTreeNode]
    });
    this.collapseSchema();
    this.currentCubeTreeNode = cubeTreeNode;
    var me = this;
    this.fireEvent("busy");
    var xmla = this.xmla;
    var cubeTreePane = this.cubeTreePane;
    this.clearTreePane(cubeTreePane);
    var cubeTreePaneDom = cubeTreePane.getDom();

    var cube = cubeTreeNode.conf.metadata;
    var cubeName = cube.CUBE_NAME;

    me.fireEvent("loadCube", cubeTreeNode);

    var catalogNode = cubeTreeNode.getParentTreeNode();
    var catalog = catalogNode.conf.metadata;
    var catalogName = catalog.CATALOG_NAME;

    var providerNode = catalogNode.getParentTreeNode();
    var metadata = providerNode.conf.metadata;
    var url = metadata.URL;
    var dataSourceInfo = metadata.DataSourceInfo;

    //static indicator of the current catalog and cube
    var currentCatalog = cEl("SPAN", {
      "class": "current-catalog",
      "data-objectName": catalogName
    });
    var currentCube = cEl("SPAN", {
      "class": "current-cube",
      "data-objectName": cubeName
    });
    var currentCatalogAndCube =  cEl("DIV", {
      "class": "current-catalog-and-cube"
    }, [currentCatalog, currentCube], cubeTreePaneDom);
    listen(currentCatalogAndCube, "click", function(e){
      var target = e.getTarget();
      if (hCls(target, "info-icon")) {
        this.fireEvent("requestinfo", {
          title: gAtt(target.parentNode, "data-objectName"),
          url: gAtt(target, "data-url"),
        });
      }
    }, this);

    var tooltipAndInfoLabel;

    tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(catalog.DESCRIPTION);
    currentCatalog.innerHTML = catalogName + tooltipAndInfoLabel.infoLabel;
    cEl("DIV", {
      "class": "tooltip"
    }, tooltipAndInfoLabel.tooltip, currentCatalog);

    tooltipAndInfoLabel = this.createNodeTooltipAndInfoLabel(cube.DESCRIPTION);
    currentCube.innerHTML = cubeName + tooltipAndInfoLabel.infoLabel;
    cEl("DIV", {
      "class": "tooltip"
    }, tooltipAndInfoLabel.tooltip, currentCube);

    this.renderMeasuresNode({
      url: url,
      dataSourceInfo: dataSourceInfo,
      catalog: catalogName,
      cube: cubeName
    });
  },
  getDom: function(){
    return this.splitPane.getDom();
  },
  getSchemaTreePane: function(){
    return this.schemaTreePane;
  },
  getCubeTreePane: function(){
    return this.cubeTreePane;
  },
  getSplitPane: function(){
    return this.splitPane;
  },
  collapseCube: function(){
    this.getSplitPane().collapse(this.getCubeTreePane().getDom());
  },
  collapseSchema: function(){
    this.getSplitPane().collapse(this.getSchemaTreePane().getDom());
  },
};

adopt(XmlaTreeView, Observable);

linkCss("../css/xmlatreeview.css");
})();
