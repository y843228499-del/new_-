
import { CipDataType } from '../../type-definitions/eip';

export interface XmlNode {
    name: string;
    path: string;
    type: string;        
    dataTypeName: string; 
    cipType: CipDataType;
    children?: XmlNode[];
    isLeaf: boolean;
    arrayDimensions?: number[]; // UI 显示用：仅长度
    isStructDef?: boolean;
}

// 扩展 IEC 类型映射表
const TYPE_MAP: Record<string, CipDataType> = {
    // Basic Types
    'BOOL': CipDataType.BOOL,
    'SINT': CipDataType.SINT, 'INT': CipDataType.INT, 'DINT': CipDataType.DINT, 'LINT': CipDataType.LINT,
    'USINT': CipDataType.USINT, 'UINT': CipDataType.UINT, 'UDINT': CipDataType.UDINT, 'ULINT': CipDataType.ULINT,
    'REAL': CipDataType.REAL, 'LREAL': CipDataType.LREAL,
    'STRING': CipDataType.STRING, 'WSTRING': CipDataType.WSTRING,
    'BYTE': CipDataType.BYTE, 'WORD': CipDataType.WORD, 'DWORD': CipDataType.DWORD, 'LWORD': CipDataType.LWORD,
    
    // Time Types
    'TIME': CipDataType.TIME, 'TIME_OF_DAY': CipDataType.TIME_OF_DAY, 'TOD': CipDataType.TIME_OF_DAY,
    'DATE': CipDataType.DATE, 'DATE_AND_TIME': CipDataType.DATE_AND_TIME, 'DT': CipDataType.DATE_AND_TIME, 'LTIME': CipDataType.LTIME
};

interface TypeDef {
    name: string;      
    iecName: string;   
    baseType?: string; 
    cipType?: CipDataType; 
    elements?: { name: string; type: string }[]; 
    dims?: { min: number, max: number }[];
}

export class SymbolXmlParser {
    private typeDefs: Map<string, TypeDef> = new Map();

    parse(xmlString: string): XmlNode[] {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlString, "text/xml");
        
        this.typeDefs.clear();

        // 1. 解析类型定义 (TypeList)
        const typeList = doc.getElementsByTagName("TypeList")[0];
        if (typeList) {
            Array.from(typeList.children).forEach(typeNode => {
                this.parseTypeDefinition(typeNode);
            });
        }

        const result: XmlNode[] = [];

        // 2. 结构体定义视图
        const structDefsNodes: XmlNode[] = [];
        this.typeDefs.forEach((def) => {
            // 只显示纯结构体定义（非数组包装器）
            if (def.elements && (!def.dims || def.dims.length === 0)) {
                const children = this.buildStructChildren(def, "");
                structDefsNodes.push({
                    name: def.iecName || def.name,
                    path: `__UDT__:${def.name}`,
                    type: def.name,
                    dataTypeName: 'STRUCT',
                    cipType: CipDataType.STRUCT,
                    isLeaf: false,
                    isStructDef: true,
                    children: children
                });
            }
        });
        structDefsNodes.sort((a, b) => a.name.localeCompare(b.name));

        if (structDefsNodes.length > 0) {
            result.push({
                name: "Data Types (结构体定义)",
                path: "__UDT_ROOT__",
                type: "Folder",
                dataTypeName: "Folder",
                cipType: CipDataType.STRUCT,
                isLeaf: false,
                children: structDefsNodes
            });
        }

        // 3. 变量实例列表 (NodeList)
        const nodeList = doc.getElementsByTagName("NodeList")[0];
        const instanceNodes: XmlNode[] = [];
        
        if (nodeList) {
            Array.from(nodeList.children).forEach(node => {
                const parsed = this.parseInstanceNode(node, "");
                if (parsed) instanceNodes.push(parsed);
            });
        }
        
        // --- 排序逻辑优化 (Strict Sorting Strategy) ---
        // 规则：
        // 1. 结构体 > 数组 > 标量 (Priority)
        // 2. 数据类型名称 (Type Grouping)
        // 3. 变量名称 (English > Chinese)
        const getPriority = (node: XmlNode) => {
            // Priority 30: Structs (Complex types) always top
            if (node.cipType === CipDataType.STRUCT) return 30;
            
            // Priority 20: Arrays of Basic Types
            if (node.arrayDimensions && node.arrayDimensions.length > 0) return 20;
            
            // Priority 10: Basic Scalars
            return 10;
        };

        instanceNodes.sort((a, b) => {
            const pA = getPriority(a);
            const pB = getPriority(b);
            
            // 1. 按权重降序 (30 -> 20 -> 10)
            if (pA !== pB) return pB - pA; 

            // 2. 按数据类型名称聚类 (Alphabetical)
            // 确保相同类型的变量在一起 (如所有 BOOL 在一起，所有 REAL 在一起)
            const typeA = (a.dataTypeName || "").toUpperCase();
            const typeB = (b.dataTypeName || "").toUpperCase();
            if (typeA !== typeB) {
                return typeA.localeCompare(typeB, 'en');
            }

            // 3. 按变量名称排序 (ASCII First)
            // 解决中文标签混在英文标签中的问题，强制英文/数字名排在前面，中文沉底
            const isAsciiA = /^[\x00-\x7F]*$/.test(a.name);
            const isAsciiB = /^[\x00-\x7F]*$/.test(b.name);

            if (isAsciiA && !isAsciiB) return -1; // A (English) comes before B (Chinese)
            if (!isAsciiA && isAsciiB) return 1;  // B (English) comes before A (Chinese)

            // 同为中文或同为英文时，使用自然排序
            return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
        });

        result.push({
            name: "Variables (变量实例)",
            path: "__VAR_ROOT__",
            type: "Folder",
            dataTypeName: "Folder",
            cipType: CipDataType.STRUCT,
            isLeaf: false,
            children: instanceNodes
        });

        return result;
    }

    private parseTypeDefinition(xmlType: Element) {
        const name = xmlType.getAttribute("name");
        if (!name) return;

        const iecName = xmlType.getAttribute("iecname") || name;
        const baseType = xmlType.getAttribute("basetype") || "";

        const def: TypeDef = { name, iecName, baseType };

        // 1. Array Detection
        const arrayDims = Array.from(xmlType.getElementsByTagName("ArrayDim"));
        if (arrayDims.length > 0) {
            def.dims = arrayDims.map(dim => {
                const min = parseInt(dim.getAttribute("minrange") || "0");
                const max = parseInt(dim.getAttribute("maxrange") || "0");
                return { min, max };
            });
        }

        // 2. Struct Detection (UserDefElement)
        if (!def.dims || def.dims.length === 0) {
            const elements = Array.from(xmlType.getElementsByTagName("UserDefElement"));
            if (elements.length > 0) {
                def.elements = elements.map(el => ({
                    name: el.getAttribute("iecname") || "UnkMember",
                    type: el.getAttribute("type") || ""
                }));
            }
        }
        
        // 3. Resolve Primitive Type
        let cleanName = this.normalizeTypeName(iecName);
        if (TYPE_MAP[cleanName]) {
            def.cipType = TYPE_MAP[cleanName];
        }

        this.typeDefs.set(name, def);
    }

    private findTypeDef(typeName: string): TypeDef | undefined {
        if (!typeName) return undefined;
        if (this.typeDefs.has(typeName)) return this.typeDefs.get(typeName);
        
        // Fuzzy Match Logic
        // 1. Try T_ prefix (CODESYS standard)
        if (typeName.startsWith("T_")) {
            const noPrefix = typeName.substring(2);
            if (this.typeDefs.has(noPrefix)) return this.typeDefs.get(noPrefix);
        } else {
            const withPrefix = "T_" + typeName;
            if (this.typeDefs.has(withPrefix)) return this.typeDefs.get(withPrefix);
        }

        // 2. Clean up name (remove spaces, dots, arrays for fuzzy lookup)
        const dotParts = typeName.split('.');
        const shortName = dotParts[dotParts.length - 1].split('[')[0].trim();
        
        for (const key of this.typeDefs.keys()) {
            // Case insensitive match on TypeName
            if (key.toUpperCase() === shortName.toUpperCase()) return this.typeDefs.get(key);
            
            // Case insensitive match on IecName
            const def = this.typeDefs.get(key);
            if (def && def.iecName.toUpperCase() === shortName.toUpperCase()) return def;
        }

        return undefined;
    }

    private normalizeTypeName(name: string): string {
        return name.split('[')[0].split('(')[0].trim().toUpperCase();
    }

    /**
     * 核心逻辑升级：类型解析与内联数组支持
     */
    private resolveFinalType(typeName: string): { cipType: CipDataType, dataTypeName: string, dims?: {min:number, max:number}[], baseType?: string } {
        // --- 关键修复 ---
        // 优先级 1: 检查是否为 Inline Array (如 "BOOL[10]")
        // Regex matches: "Type[10]" or "Type [0..9]" or "Type[1,2]"
        // Exclude standard "ARRAY [...] OF ..." which is handled later or via TypeList
        const isInlineArray = !typeName.trim().toUpperCase().startsWith("ARRAY") && typeName.includes('[') && typeName.trim().endsWith(']');

        if (isInlineArray) {
            const bracketMatch = typeName.match(/^(.+?)\s*\[([\d\.\,\s]+)\]$/);
            
            if (bracketMatch) {
                const baseTypeStr = bracketMatch[1].trim(); 
                const dimStr = bracketMatch[2].trim();

                const dims: {min: number, max: number}[] = [];
                const ranges = dimStr.split(',');
                
                ranges.forEach(r => {
                    const rangeParts = r.trim().split('..');
                    if (rangeParts.length === 2) {
                        dims.push({
                            min: parseInt(rangeParts[0].trim()),
                            max: parseInt(rangeParts[1].trim())
                        });
                    } else {
                        const len = parseInt(r.trim());
                        if (!isNaN(len) && len > 0) {
                            // Convention: Size N -> [0..N-1]
                            dims.push({ min: 0, max: len - 1 });
                        }
                    }
                });

                if (dims.length > 0) {
                    // Recursively resolve the base type (e.g. "BOOL" -> CipDataType.BOOL)
                    const baseInfo = this.resolveFinalType(baseTypeStr);
                    return {
                        cipType: baseInfo.cipType, 
                        dataTypeName: baseInfo.dataTypeName, // Keep base name (e.g. "BOOL")
                        dims: dims,
                        baseType: baseTypeStr
                    };
                }
            }
        }

        // 优先级 2: 查找已定义的类型 (TypeDef from TypeList)
        const def = this.findTypeDef(typeName);
        
        if (def) {
            let finalCipType = def.cipType;
            let finalName = def.iecName;
            let baseTypeName = def.baseType; 

            if (finalCipType === undefined) {
                 if (def.elements) {
                     finalCipType = CipDataType.STRUCT;
                     finalName = def.iecName;
                 } else if (def.baseType) {
                     const parent = this.resolveFinalType(def.baseType);
                     finalCipType = parent.cipType;
                     if (!def.dims) {
                         finalName = parent.dataTypeName;
                     }
                 } else {
                     finalCipType = CipDataType.STRUCT;
                 }
            }
            return { cipType: finalCipType || CipDataType.STRUCT, dataTypeName: finalName, dims: def.dims, baseType: baseTypeName };
        }

        // 优先级 3: 匹配标准 IEC "ARRAY [0..9] OF INT" 格式
        const standardArrayMatch = typeName.match(/^ARRAY\s*\[(.*?)\]\s*OF\s*(.*)$/i);
        if (standardArrayMatch) {
            const dimPart = standardArrayMatch[1]; 
            const baseTypeStr = standardArrayMatch[2].trim();

            const dims: {min: number, max: number}[] = [];
            const dimStrings = dimPart.split(',');
            
            dimStrings.forEach(ds => {
                const rangeParts = ds.split('..');
                if (rangeParts.length === 2) {
                    dims.push({
                        min: parseInt(rangeParts[0].trim()),
                        max: parseInt(rangeParts[1].trim())
                    });
                }
            });

            const baseInfo = this.resolveFinalType(baseTypeStr);
            return { 
                cipType: baseInfo.cipType, 
                dataTypeName: baseInfo.dataTypeName, 
                dims: dims,
                baseType: baseTypeStr
            };
        }

        // 优先级 4: 基础类型直接映射 (Primitive)
        const cleanName = this.normalizeTypeName(typeName);
        const rawType = TYPE_MAP[cleanName];
        if (rawType !== undefined) {
            return { cipType: rawType, dataTypeName: typeName };
        }

        // 5. 无法识别，默认为 STRUCT (可能是未定义的复杂类型)
        return { cipType: CipDataType.STRUCT, dataTypeName: typeName };
    }

    private generateFlattenedArrayChildren(
        name: string, 
        currentPath: string, 
        dims: {min: number, max: number}[], 
        baseType: string, 
        typeInfo: any
    ): XmlNode[] {
        const children: XmlNode[] = [];
        const MAX_EXPAND = 50000; // Increased limit for large arrays
        
        // Use iterative approach to generate indices to avoid recursion depth issues
        const indicesList: number[][] = [];
        
        const collectIndices = (dIndex: number, currentPrefix: number[]) => {
            if (indicesList.length >= MAX_EXPAND) return;
            
            if (dIndex >= dims.length) {
                indicesList.push(currentPrefix);
                return;
            }
            
            const dim = dims[dIndex];
            for (let i = dim.min; i <= dim.max; i++) {
                collectIndices(dIndex + 1, [...currentPrefix, i]);
                if (indicesList.length >= MAX_EXPAND) break;
            }
        };

        collectIndices(0, []);

        // Resolve Base Type details
        let def = this.findTypeDef(baseType);
        const baseTypeInfo = this.resolveFinalType(baseType);

        for (const indices of indicesList) {
            const indexStr = `[${indices.join(',')}]`; 
            const childName = indexStr;
            const childPath = `${currentPath}${indexStr}`;

            let grandChildren: XmlNode[] = [];
            let isLeaf = true;

            // If the element itself is a Struct, expand it
            if (def && def.elements) {
                isLeaf = false;
                def.elements.forEach(el => {
                    const childNode = this.buildVirtualNode(el.name, el.type, childPath);
                    grandChildren.push(childNode);
                });
            } else if (baseTypeInfo.cipType === CipDataType.STRUCT && !def) {
                 // Try to see if resolveFinalType found a base type name that maps to a definition we missed
                 // This handles the "Array of Alias to Struct" case
                 const aliasDef = this.findTypeDef(baseTypeInfo.dataTypeName);
                 if (aliasDef && aliasDef.elements) {
                     isLeaf = false;
                     aliasDef.elements.forEach(el => {
                         const childNode = this.buildVirtualNode(el.name, el.type, childPath);
                         grandChildren.push(childNode);
                     });
                 }
            }

            children.push({
                name: childName,
                path: childPath,
                type: baseType,
                dataTypeName: baseTypeInfo.dataTypeName,
                cipType: baseTypeInfo.cipType,
                isLeaf: isLeaf,
                children: grandChildren.length > 0 ? grandChildren : undefined
            });
        }

        return children;
    }

    private parseInstanceNode(xmlNode: Element, parentPath: string): XmlNode | null {
        const name = xmlNode.getAttribute("name");
        if (!name) return null;

        const currentPath = parentPath ? `${parentPath}.${name}` : name;
        const typeName = xmlNode.getAttribute("type") || "";
        
        const typeInfo = this.resolveFinalType(typeName);
        const def = this.findTypeDef(typeName); 
        
        const children: XmlNode[] = [];
        let isLeaf = true;

        if (xmlNode.children.length > 0) {
            Array.from(xmlNode.children).forEach(child => {
                const childNode = this.parseInstanceNode(child, currentPath);
                if (childNode) children.push(childNode);
            });
            if (children.length > 0) isLeaf = false;
        }

        // Array Expansion (Prioritized)
        if (typeInfo.dims && typeInfo.dims.length > 0) {
            isLeaf = false;
            // Use the base type from typeInfo if available (from inline parsing), otherwise def.baseType
            let baseTypeName = typeInfo.baseType || (def && def.baseType ? def.baseType : "");
            
            const arrayChildren = this.generateFlattenedArrayChildren(name, currentPath, typeInfo.dims, baseTypeName, typeInfo);
            children.push(...arrayChildren);
        }
        else if (def && def.elements) {
            isLeaf = false;
            def.elements.forEach(el => {
                const childNode = this.buildVirtualNode(el.name, el.type, currentPath);
                children.push(childNode);
            });
        }

        let arrayDimDisplay: number[] | undefined = undefined;
        if (typeInfo.dims) {
            arrayDimDisplay = typeInfo.dims.map(d => d.max - d.min + 1);
        }

        return {
            name: name,
            path: currentPath,
            type: typeName, 
            dataTypeName: typeInfo.dataTypeName, 
            cipType: typeInfo.cipType,
            children: children.length > 0 ? children : undefined,
            isLeaf: isLeaf,
            arrayDimensions: arrayDimDisplay
        };
    }

    private buildVirtualNode(name: string, typeName: string, parentPath: string): XmlNode {
        const currentPath = `${parentPath}.${name}`;
        const typeInfo = this.resolveFinalType(typeName);
        const def = this.findTypeDef(typeName); 
        
        const children: XmlNode[] = [];
        let isLeaf = true;

        if (typeInfo.dims && typeInfo.dims.length > 0) {
            isLeaf = false;
            let baseTypeName = typeInfo.baseType || (def && def.baseType ? def.baseType : "");
            const arrayChildren = this.generateFlattenedArrayChildren(name, currentPath, typeInfo.dims, baseTypeName, typeInfo);
            children.push(...arrayChildren);
        }
        else if (def && def.elements) {
            isLeaf = false;
            def.elements.forEach(el => {
                const child = this.buildVirtualNode(el.name, el.type, currentPath);
                children.push(child);
            });
        }

        let arrayDimDisplay: number[] | undefined = undefined;
        if (typeInfo.dims) {
            arrayDimDisplay = typeInfo.dims.map(d => d.max - d.min + 1);
        }

        return {
            name: name,
            path: currentPath,
            type: typeName,
            dataTypeName: typeInfo.dataTypeName,
            cipType: typeInfo.cipType,
            isLeaf: isLeaf,
            arrayDimensions: arrayDimDisplay,
            children: children.length > 0 ? children : undefined
        };
    }

    private buildStructChildren(def: TypeDef, parentPath: string): XmlNode[] {
         if (!def.elements) return [];
         return def.elements.map(el => {
             const typeInfo = this.resolveFinalType(el.type);
             return {
                 name: `${el.name} : ${typeInfo.dataTypeName}`,
                 path: `__UDT__:${def.name}.${el.name}`,
                 type: el.type,
                 dataTypeName: typeInfo.dataTypeName,
                 cipType: typeInfo.cipType,
                 isLeaf: true, 
                 arrayDimensions: undefined 
             };
         });
    }
}
