# 20条测绘中英双语基准题

固定参考答案用于数字人对比，不是教材逐字摘录。

## Q01 · precision, accuracy

中文：精密度与准确度有什么区别？

English: What is the difference between precision and accuracy?

中文参考：精密度反映重复测量结果的接近程度；准确度反映结果接近参考真值的程度。精密不等于准确。

English reference: Precision describes agreement among repeated measurements. Accuracy describes closeness to a reference value. High precision does not guarantee high accuracy.

## Q02 · level, line of sight

中文：水准仪为什么需要水平视线？

English: Why does a level need a horizontal line of sight?

中文参考：水平视线为标尺读数提供共同基准，后视读数减前视读数得到两点高差。

English reference: A horizontal line of sight provides a common reference for staff readings. Height difference equals backsight minus foresight.

## Q03 · backsight, foresight

中文：后视1.425米、前视1.180米，高差是多少？

English: The backsight is 1.425 metres and the foresight is 1.180 metres. What is the height difference?

中文参考：高差为正0.245米，前视点比后视点高0.245米。

English reference: The height difference is plus 0.245 metres. The foresight point is 0.245 metres higher than the backsight point.

## Q04 · collimation error

中文：如何减小视准轴误差对水准测量的影响？

English: How can we reduce the effect of collimation error in levelling?

中文参考：尽量保持前后视距相等，并进行仪器检校。视距平衡不能消除所有误差。

English reference: Keep backsight and foresight distances approximately equal and check the instrument. Balanced sight lengths do not eliminate every error.

## Q05 · total station, EDM

中文：全站仪主要测量哪些量？

English: Which quantities does a total station measure?

中文参考：全站仪测量水平角、竖直角和斜距，结合设站信息计算坐标和高差。

English reference: A total station measures horizontal angles, vertical angles and slope distances. Station information is used to calculate coordinates and height differences.

## Q06 · zenith angle

中文：天顶距与高度角有什么关系？

English: How is a zenith angle related to an elevation angle?

中文参考：通常高度角等于90度减天顶距，但应先核对仪器的角度定义。

English reference: Under the usual convention, elevation angle equals ninety degrees minus zenith angle. Check the instrument convention first.

## Q07 · GNSS, RTK

中文：GNSS与RTK有什么区别？

English: What is the difference between GNSS and RTK?

中文参考：GNSS是全球卫星导航系统的统称。RTK利用载波相位与实时差分信息进行高精度定位。

English reference: GNSS means Global Navigation Satellite System. RTK is a positioning technique using carrier phase and real-time corrections.

## Q08 · multipath

中文：GNSS多路径效应是什么？

English: What is multipath in GNSS?

中文参考：反射信号与直达信号同时到达接收机会造成观测偏差，应避开强反射环境。

English reference: Multipath occurs when reflected signals reach the receiver along with the direct signal. Avoid strong reflectors near the antenna.

## Q09 · ellipsoidal height, normal height

中文：椭球高可以直接作为正常高吗？

English: Can ellipsoidal height be used directly as normal height?

中文参考：通常不能。两者采用不同参考面，转换需要高程异常模型与基准信息。

English reference: Usually not. They use different reference surfaces. Conversion requires a suitable height anomaly model and datum information.

## Q10 · traverse, closure

中文：导线闭合差有什么意义？

English: Why is traverse misclosure important?

中文参考：闭合差用于检验观测与计算一致性，应先检查限差再平差，不能用平差掩盖粗差。

English reference: Misclosure checks consistency. Check the tolerance before adjustment. Adjustment must not conceal blunders.

## Q11 · photogrammetry, overlap

中文：摄影测量为什么需要影像重叠？

English: Why is image overlap needed in photogrammetry?

中文参考：重叠影像提供同名点和多视几何约束，用于恢复相机姿态和三维位置。

English reference: Overlapping images provide corresponding points and multiple viewing rays for estimating camera poses and three-dimensional positions.

## Q12 · GSD, resolution

中文：GSD小是否一定意味着精度高？

English: Does a small GSD always guarantee high mapping accuracy?

中文参考：不一定，地面采样距离描述像元的地面尺寸，精度还取决于控制点、成像质量和几何条件。

English reference: No. Ground sampling distance describes ground pixel size. Accuracy also depends on control, image quality and geometry.

## Q13 · LiDAR, point cloud

中文：LiDAR点云与影像有什么不同？

English: How does a LiDAR point cloud differ from an image?

中文参考：点云表达离散三维点及属性，影像在规则网格记录辐射或颜色信息。

English reference: A point cloud represents discrete three-dimensional locations and attributes. An image stores radiometric or colour information in a regular pixel grid.

## Q14 · DEM, DSM, DTM

中文：DEM、DSM、DTM分别是什么？

English: What do DEM, DSM and DTM represent?

中文参考：DEM泛指数字高程模型，DSM通常含建筑植被表面，DTM通常强调裸地地形，具体应核对数据说明。

English reference: DEM is a general elevation model. DSM usually includes buildings and vegetation. DTM generally represents bare terrain. Check the dataset specification.

## Q15 · slope, contour

中文：等高线密集说明什么？

English: What do closely spaced contours usually indicate?

中文参考：在等高距和比例尺一致时，等高线越密集通常坡度越大。

English reference: With the same contour interval and map scale, closely spaced contours generally indicate a steeper slope.

## Q16 · GIS, vector, raster

中文：矢量与栅格数据有什么区别？

English: How do vector and raster data differ in GIS?

中文参考：矢量以点线面表达要素，栅格以网格单元表达空间属性，常用于连续场。

English reference: Vector data represent features as points, lines and polygons. Raster data store values in grid cells and are useful for continuous surfaces.

## Q17 · projection, distortion

中文：地图投影为什么会变形？

English: Why do map projections introduce distortion?

中文参考：曲面映射到平面无法同时保持所有几何性质，应根据任务选择投影。

English reference: A curved surface cannot be mapped to a plane while preserving every geometric property. Choose a projection according to the task.

## Q18 · remote sensing, spectral

中文：遥感光谱分辨率是什么？

English: What is spectral resolution in remote sensing?

中文参考：光谱分辨率描述区分波长范围的能力，与波段宽度和位置有关。

English reference: Spectral resolution describes the ability to distinguish wavelength intervals. Band widths and positions affect that ability.

## Q19 · registration, check point

中文：为什么要区分控制点和独立检查点？

English: Why should control points and independent check points be separate?

中文参考：控制点参与拟合，检查点独立评价，不能用同一批拟合点代替独立验收。

English reference: Control points contribute to model fitting. Independent check points evaluate the result. Reusing fitting points for validation can overestimate accuracy.

## Q20 · datum, coordinate system

中文：叠加不同坐标系数据前要检查什么？

English: What should be checked before overlaying data from different coordinate systems?

中文参考：检查参考基准、投影、单位、轴顺序和转换参数，不能只改坐标系标签。

English reference: Check the datum, projection, units, axis order and transformation parameters. Relabelling a coordinate system is not a coordinate transformation.