function StringBuilder(value)
{
    this.strings = new Array();
    this.append(value);
}

StringBuilder.prototype.append = function (value)
{
    if (value && value.length > 0)
    {
        this.strings.push(value);
    }
}

StringBuilder.prototype.clear = function ()
{
    this.strings.length = 0;
}

StringBuilder.prototype.toString = function ()
{
    return this.strings.join("");
}

StringBuilder.prototype.count = function ()
{
	return this.strings.length;
}

exports.StringBuilder = StringBuilder;