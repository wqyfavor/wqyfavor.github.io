var StringBuilder = require('./StringBuilder').StringBuilder;

var format = function() 
{
    if (arguments.length == 0)
        return null;

    var str = arguments[0];
    for (var i = 1; i < arguments.length; i ++)
     {
        var re = new RegExp('\\{' + (i-1) + '\\}','gm');
        str = str.replace(re, arguments[i]);
    }
    return str;
}

function isIdentifier(c)
{
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || (c == '_');
}

var convertor = function(script, cb) 
{
    // 找类名
    var classMatches = script.match(/@interface\s*\w+\s*:\s*\w+/gi);

    if (classMatches.length == 0) 
    {
        if (cb) cb(null, "No class found.");
        return;
    }

    var classLine = classMatches[0].substring("@interface".length);
    var className = classLine.substring(0, classLine.indexOf(":")).trim();
    
    console.log(className);

    // 属性列表
    var propertyMatches = script.match(/@property\s*(\(.+\)\s*)?(\w|\s|\*)+\w+\s*;/gi);
    if (propertyMatches.length == 0)
    {
        if (cb) cb(null, "No property found.");
        return;
    }

    var properties = new Array();
    var ignoredProperties = new Array();
    for (prop in propertyMatches)
    {
        prop = propertyMatches[prop];
        rawProp = new String(prop);

        prop = prop.substring("@property".length).trim();
        if (prop[0] == '(')
            prop = prop.substring(prop.indexOf(')') + 1).trim();

        // 去掉后面的分号
        var propName = "";
        prop = prop.substring(0, prop.length - 1).trim();
        for (var i = prop.length - 1; i >= 0; i--)
        {
            if (!isIdentifier(prop[i])) 
            {
                propName = prop.substring(i + 1).trim();
                prop = prop.substring(0, i + 1).trim();
                break;
            }
        }

        if (propName.length == 0)
        {
            ignoredProperties.push(rawProp);
            continue;            
        }

        prop = prop.replace(/\s/, "");
        properties.push({type:prop, name:propName, raw:rawProp});
        console.log(propName + ":" + prop);
    }

    if (properties.length == 0) 
    {
        if (cb) cb(null, "No valid property found.");
        return;
    }

    // 生成 create table 语句
    var createTableSQL = new StringBuilder("");
    var propertiesLine = new StringBuilder("");
    for (prop in properties)
    {
        var sqlType = "";
        
        prop = properties[prop];
        if (prop.type == "NSString*")
        {
            sqlType = "text";
        }
        else if (prop.type == "NSData*")
        {
            sqlType = "blob";
        }
        else if (prop.type == "NSDate*" || prop.type == "double" || prop.type == "float" || 
            prop.type == "CGFloat" || prop.type == "NSTimeInterval")
        {
            sqlType = "double";
        }
        else if (prop[prop.length - 1] == '*')
        {
            ignoredProperties.push(prop.raw);
        }
        else
        {
            sqlType = "integer";            
        }
        
        if (sqlType.length > 0)
        {
            if (createTableSQL.count() > 0)
            {
                createTableSQL.append(format(", {0}", prop.name));
            }
            else
            {
                createTableSQL.append(prop.name);
            }
            
            createTableSQL.append(" ");
            createTableSQL.append(sqlType);
            if (propertiesLine.count() > 0)
            {
                propertiesLine.append(format(", {0}", prop.name));
            }
            else
            {
                propertiesLine.append(prop.name);
            }
        }
    }
    
    var xml = new StringBuilder("");
    xml.append(format("<module name=\"{0}\" initializer=\"createTable\" tableName=\"{1}_table\" version=\"1.0\">\n", className, className));
    xml.append("\n");
    xml.append(format("    <const table_columns=\"({0})\"/>\n", propertiesLine));
    xml.append(format("    <const table_values=\"%%{'#{m.*}', {0}}\"/>\n", propertiesLine));   
    xml.append(format("    <const table_update=\"update ${T} set %%{'* = #{m.*}', {0}}\"/>\n", propertiesLine));
    xml.append("\n");
    xml.append("    <update id=\"createTable\">\n");
    xml.append("        <!--在第二个step里输入建索引的语句，如果有更多索引，可以添加step。如果不需要索引，可以把step都删除，只保留创建表的SQL语句。-->\n");
    xml.append("        <step>\n");
    xml.append(format("            create table if not exists ${T} ({0})\n", createTableSQL));
    xml.append("        </step>\n");
    xml.append("        <step>\n");
    xml.append("            create index if not exists <!--输入你需要创建的索引-->\n");
    xml.append("        </step>\n");
    xml.append("    </update>\n");
    xml.append("\n");
    xml.append("    <insert id=\"insertModel\" arguments=\"m\">\n");
    xml.append("        insert into ${T} ${table_columns} values(${table_values})\n");
    xml.append("    </insert>\n");
    xml.append("\n");
    xml.append("    <insert id=\"insertModels\" arguments=\"list\" foreach=\"list.m\">\n");
    xml.append("        <!--批量插入方法，list为传入的对象数组-->\n");
    xml.append("        insert into ${T} ${table_columns} values(${table_values})\n");
    xml.append("    </insert>\n");
    xml.append("\n");
    xml.append(format("    <select id=\"getModels\" arguments=\"id\" result=\"[{0}]\">\n", className));
    xml.append("        <!--检索方法，返回符合条件的对象数组。请自行修改检索条件，id仅为模板里随意定义的。-->\n");
    xml.append("        select * from ${T} where id = #{id}\n");
    xml.append("    </select>\n");
    xml.append("\n");
    xml.append("    <delete id=\"deleteModels\" arguments=\"ids\">\n");
    xml.append("        <!--删除方法，删除所有符合条件的行。请自行修改检索条件，id仅为模板里随意定义的。-->\n");
    xml.append("        delete from ${T} where id in\n");
    xml.append("        <foreach item=\"aId\" collection=\"ids\" open=\"(\" separator=\",\" close=\")\">\n");
    xml.append("            #{aId}\n");
    xml.append("        </foreach>\n");
    xml.append("    </delete>\n");
    xml.append("\n");
    xml.append("    <update id=\"updateModel\" arguments=\"m\">\n");
    xml.append("        <!--更新某个对象，请自行补全更新的条件，并删除不需要更新的属性。-->\n");
    xml.append("        ${table_update}\n");
    xml.append("    </update>\n");
    xml.append("\n");
    xml.append("    <update id=\"updateModels\" arguments=\"list\" foreach=\"list.m\">\n");
    xml.append("        <!--批量更新对象，list为传入的对象数组。请自行补全更新的条件，并删除不需要更新的属性。-->\n");
    xml.append("        ${table_update}\n");
    xml.append("    </update>\n");
    xml.append("\n");
    xml.append("</module>");    
    
    var oc = new StringBuilder("");
    oc.append(format("@protocol {0}Protocol <APDAOProtocol>\n", className));
    oc.append("\n");
    oc.append(format("- (APDAOResult*)insertModel:({0}*)model;\n", className));
    oc.append("- (APDAOResult*)insertModels:(NSArray*)models;\n");
    oc.append("- (NSArray*)getModels:(NSString*)primaryKey;\n");
    oc.append("- (APDAOResult*)deleteModels:(NSArray*)ids;\n");
    oc.append(format("- (APDAOResult*)updateModel:({0}*)model;\n", className));
    oc.append("- (APDAOResult*)updateModels:(NSArray*)models;\n");
    oc.append("\n");
    oc.append("@end");
    oc.append("\n");

    if (cb) cb({xml:xml.toString(), oc:oc.toString(), swift:"// Will be available soon."}, null);
}

exports.convertor = convertor;